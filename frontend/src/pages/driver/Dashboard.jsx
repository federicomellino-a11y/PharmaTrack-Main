import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { useDriverAuth } from '../../contexts/DriverAuthContext';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarFallback } from '../../components/ui/avatar';
import {
  Package, MapPin, Phone, Navigation, CheckCircle2, MessageSquare,
  LogOut, RefreshCw, LocateFixed, ShieldAlert, MapPinned,
  Play, Square, Euro, AlertCircle, Wallet
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';

const LOCATION_DISTANCE_THRESHOLD = 0.00005;
const LOCATION_MIN_INTERVAL = 15000;

export default function DriverDashboard() {
  const { driver, logout, updateLocation } = useDriverAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [shift, setShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const watchIdRef = useRef(null);
  const lastSentLocationRef = useRef(null);

  useEffect(() => {
    fetchDeliveries();
    fetchShift();

    const handleNewDelivery = () => {
      fetchDeliveries();
      fetchShift();
      toast.info('Nuova consegna assegnata!');
    };

    const handleShiftSettled = () => {
      fetchShift();
      toast.success('La farmacia ha confermato il turno');
    };

    window.addEventListener('new_delivery', handleNewDelivery);
    window.addEventListener('shift_settled', handleShiftSettled);
    return () => {
      window.removeEventListener('new_delivery', handleNewDelivery);
      window.removeEventListener('shift_settled', handleShiftSettled);
    };
  }, []);

  const fetchShift = async () => {
    try {
      const res = await axios.get(`${API}/driver/shifts/current`, { withCredentials: true });
      setShift(res.data?.shift || null);
    } catch (err) {
      console.error('Errore caricamento turno:', err?.response?.status);
    }
  };

  const handleStartShift = async () => {
    setShiftLoading(true);
    try {
      const res = await axios.post(`${API}/driver/shifts/start`, {}, { withCredentials: true });
      setShift(res.data?.shift || null);
      toast.success('Turno iniziato — buona consegna!');
    } catch {
      toast.error('Errore avvio turno');
    } finally {
      setShiftLoading(false);
    }
  };

  const handleCloseShift = async () => {
    if (!shift) return;
    const expectedCash = shift.totals?.cash_total ?? 0;
    const declared = window.prompt(
      `Chiudi turno?\n\nIncasso atteso in contanti: €${Number(expectedCash).toFixed(2)}\n\nQuanto consegni alla farmacia? (puoi anche lasciare vuoto)`,
      expectedCash ? expectedCash.toFixed(2) : ''
    );
    if (declared === null) return;
    let declaredCash = null;
    if (declared.trim() !== '') {
      const parsed = parseFloat(declared.replace(',', '.'));
      if (!Number.isNaN(parsed)) declaredCash = parsed;
    }
    setShiftLoading(true);
    try {
      await axios.post(`${API}/driver/shifts/close`, { declared_cash: declaredCash }, { withCredentials: true });
      toast.success('Turno chiuso · in attesa conferma farmacia');
      fetchShift();
    } catch {
      toast.error('Errore chiusura turno');
    } finally {
      setShiftLoading(false);
    }
  };

  const fetchDeliveries = async () => {
    try {
      const response = await axios.get(`${API}/driver/deliveries`, {
        withCredentials: true,
      });
      setDeliveries(ensureArray(response.data));
    } catch {
      toast.error('Errore nel caricamento consegne');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const clearLocationWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const publishLocation = useCallback(async (position) => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const now = Date.now();
    const previous = lastSentLocationRef.current;

    const sameArea = previous
      && Math.abs(previous.lat - lat) < LOCATION_DISTANCE_THRESHOLD
      && Math.abs(previous.lng - lng) < LOCATION_DISTANCE_THRESHOLD;
    const sentRecently = previous && now - previous.timestamp < LOCATION_MIN_INTERVAL;

    if (sameArea && sentRecently) {
      setLocationStatus('enabled');
      return;
    }

    await updateLocation(lat, lng);
    lastSentLocationRef.current = { lat, lng, timestamp: now };
    setLocationStatus('enabled');
  }, [updateLocation]);

  const startLocationSharing = useCallback((silent = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unsupported');
      if (!silent) toast.error('Geolocalizzazione non supportata su questo dispositivo');
      return;
    }

    if (watchIdRef.current !== null) {
      setLocationStatus('enabled');
      return;
    }

    setLocationStatus('requesting');

    const handleSuccess = (position) => {
      publishLocation(position).catch(() => {
        setLocationStatus('error');
      });
    };

    const handleError = (error) => {
      clearLocationWatch();
      if (error.code === 1) {
        setLocationStatus('denied');
        if (!silent) toast.error('Permesso posizione negato. Attivalo dalle impostazioni del browser.');
        return;
      }
      setLocationStatus('error');
      if (!silent) toast.error('Impossibile attivare la posizione live');
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 15000,
    });
  }, [clearLocationWatch, publishLocation]);

  useEffect(() => {
    let mounted = true;

    const hydratePermission = async () => {
      if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (!mounted) return;
        if (permission.state === 'granted') {
          startLocationSharing(true);
        } else if (permission.state === 'denied') {
          setLocationStatus('denied');
        }
      } catch {
        // Safari may not support permissions query for geolocation
      }
    };

    hydratePermission();

    return () => {
      mounted = false;
      clearLocationWatch();
    };
  }, [clearLocationWatch, startLocationSharing]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDeliveries();
  };

  const statusLabels = {
    assigned: 'Da ritirare',
    picked_up: 'Ritirata',
    in_transit: 'In consegna',
    delivered_pending_confirmation: 'Consegnata · in attesa farmacia',
  };

  const safeDeliveries = ensureArray(deliveries);
  const activeDeliveries = safeDeliveries.filter((delivery) => ['assigned', 'picked_up', 'in_transit'].includes(delivery.status));
  const pendingConfirmDeliveries = safeDeliveries.filter((delivery) => delivery.status === 'delivered_pending_confirmation');
  const completedTodayCount = safeDeliveries.filter((delivery) => {
    if (!['delivered', 'delivered_pending_confirmation'].includes(delivery.status)) return false;
    const ref = delivery.actual_delivery || delivery.updated_at;
    if (!ref) return false;
    return new Date(ref).toDateString() === new Date().toDateString();
  }).length;

  if (loading) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-[#09090B]">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-[#09090B] pb-20" data-testid="driver-dashboard">
      <header className="sticky top-0 z-40 glass px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-teal-500/20 text-teal-400">
                {driver?.name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-white">{driver?.name}</p>
              <p className="text-xs text-zinc-500">{driver?.vehicle_type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-zinc-400"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {/* Card TURNO */}
        <Card className={`border ${shift ? (shift.status === 'open' ? 'border-teal-500/30 bg-teal-500/5' : 'border-amber-500/40 bg-amber-500/5') : 'border-zinc-800 bg-zinc-900/50'}`}>
          <CardContent className="p-4">
            {!shift ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl p-2.5 bg-zinc-800 text-zinc-300">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Inizia turno</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Apri il giro per tracciare incassi e consegne</p>
                  </div>
                </div>
                <Button
                  onClick={handleStartShift}
                  disabled={shiftLoading}
                  className="bg-teal-500 hover:bg-teal-600 text-black font-semibold"
                  data-testid="driver-start-shift-btn"
                >
                  <Play className="w-4 h-4 mr-1.5" />Inizia
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-2xl p-2 ${shift.status === 'open' ? 'bg-teal-500/20 text-teal-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {shift.status === 'open' ? <Wallet className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-white">
                        {shift.status === 'open' ? 'Turno aperto' : 'In attesa conferma farmacia'}
                      </p>
                      <p className="text-xs text-zinc-400">
                        Iniziato {new Date(shift.started_at).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'})}
                      </p>
                    </div>
                  </div>
                  {shift.status === 'open' && (
                    <Button
                      onClick={handleCloseShift}
                      disabled={shiftLoading}
                      className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                      size="sm"
                      data-testid="driver-close-shift-btn"
                    >
                      <Square className="w-4 h-4 mr-1.5" />Chiudi
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-zinc-900/70 p-2">
                    <p className="text-lg font-bold text-white">{shift.totals?.delivered_count ?? 0}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Consegne</p>
                  </div>
                  <div className="rounded-lg bg-zinc-900/70 p-2">
                    <p className="text-lg font-bold text-emerald-400">€{(shift.totals?.cash_total ?? 0).toFixed(2)}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Contanti</p>
                  </div>
                  <div className="rounded-lg bg-zinc-900/70 p-2">
                    <p className="text-lg font-bold text-sky-400">€{(shift.totals?.pos_total ?? 0).toFixed(2)}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">POS</p>
                  </div>
                </div>
                {shift.status === 'closed_by_driver' && (
                  <p className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2">
                    Hai chiuso il turno dichiarando €{(shift.driver_declared_cash ?? 0).toFixed(2)}. Aspetta la conferma della farmacia.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-teal-400">{activeDeliveries.length}</p>
              <p className="text-sm text-zinc-400">Consegne attive</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">{completedTodayCount}</p>
              <p className="text-sm text-zinc-400">Completate oggi</p>
            </CardContent>
          </Card>
        </div>

        <Card className={`border ${locationStatus === 'enabled' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`rounded-2xl p-2 ${locationStatus === 'enabled' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                {locationStatus === 'enabled' ? <MapPinned className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">
                  {locationStatus === 'enabled' ? 'Posizione live attiva' : 'Attiva la posizione live'}
                </p>
                <p className="mt-1 text-sm text-zinc-300">
                  {locationStatus === 'enabled'
                    ? 'La farmacia può vederti nella schermata Tracking durante le consegne in corso.'
                    : 'Per comparire sulla mappa Tracking, tocca il pulsante qui sotto e consenti l’accesso alla posizione del browser.'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {locationStatus !== 'enabled' ? (
                    <Button
                      type="button"
                      className="bg-teal-500 text-black hover:bg-teal-600"
                      onClick={() => startLocationSharing(false)}
                    >
                      <LocateFixed className="mr-2 h-4 w-4" />
                      {locationStatus === 'requesting' ? 'Richiesta permesso…' : 'Attiva posizione live'}
                    </Button>
                  ) : (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Tracking attivo
                    </Badge>
                  )}
                  {locationStatus === 'denied' && (
                    <span className="text-xs text-amber-200">Permesso negato: abilitalo dalle impostazioni del browser e riprova.</span>
                  )}
                  {locationStatus === 'unsupported' && (
                    <span className="text-xs text-amber-200">Questo dispositivo non supporta la geolocalizzazione web.</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="px-4">
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Package className="w-5 h-5 text-teal-400" />
          Le tue consegne
        </h2>

        {activeDeliveries.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400">Nessuna consegna assegnata</p>
              <p className="text-zinc-500 text-sm mt-1">Le nuove consegne appariranno qui</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeDeliveries.map((delivery, index) => (
              <Card
                key={delivery.delivery_id}
                className={`bg-zinc-900/50 border-zinc-800 hover:border-teal-500/30 transition-colors animate-slide-up stagger-${(index % 3) + 1}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-white">{delivery.customer_name}</h3>
                      <div className="flex gap-2 mt-1">
                        <Badge className={`status-${delivery.status}`}>
                          {statusLabels[delivery.status]}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2 text-zinc-400">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{delivery.customer_address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Phone className="w-4 h-4" />
                      <a href={`tel:${delivery.customer_phone}`} className="hover:text-teal-400">
                        {delivery.customer_phone}
                      </a>
                    </div>
                    <p className="text-zinc-500 pl-6">
                      <strong>Note:</strong> {delivery.notes || '-'}
                    </p>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button
                      asChild
                      className="flex-1 bg-teal-500 hover:bg-teal-600 text-black"
                      data-testid={`view-delivery-${delivery.delivery_id}`}
                    >
                      <Link to={`/driver/delivery/${delivery.delivery_id}`}>
                        <Navigation className="w-4 h-4 mr-2" />
                        Dettagli
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="border-zinc-700"
                      asChild
                    >
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.customer_address)}`} target="_blank" rel="noopener noreferrer">
                        <MapPin className="w-4 h-4" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <nav className="mobile-nav">
        <div className="flex justify-around">
          <Link to="/driver" className="mobile-nav-item active">
            <Package className="w-5 h-5" />
            <span>Consegne</span>
          </Link>
          <Link to="/driver/chat" className="mobile-nav-item">
            <MessageSquare className="w-5 h-5" />
            <span>Chat</span>
          </Link>
          <button onClick={logout} className="mobile-nav-item">
            <LogOut className="w-5 h-5" />
            <span>Esci</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
