import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeliveriesQuery, useDriversQuery, usePlanQuery } from '@/hooks/queries';
import ProGate from '../../components/ProGate';
import { funzioneSbloccata } from '@/lib/funzioniPro';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { safeInvalidateSize } from '@/lib/leafletSafe';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { useSocket } from '../../contexts/SocketContext';
import { useAuth } from '../../contexts/AuthContext';
import { MapPin, Truck, Package, RefreshCw, AlertTriangle, LocateFixed } from 'lucide-react';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';
import { geocodeAddress as geocodeWithRateLimit } from '../../lib/geocoding';
import { ensureArray, ensureObject } from '@/lib/collections';
import SezioneFattorini from '../../components/tracking/SezioneFattorini';
import {
  STATI_PRESENZA,
  SOGLIA_LIVE_MIN,
  SOGLIA_RITARDO_MIN,
  statoPresenza,
  testoUltimoAggiornamento,
  testoEta,
} from '@/lib/trackingPresenze';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Haversine formula — returns km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Un colore per stato: verde petrolio quando la posizione e' fresca, ambra
// quando si e' fermata, grigio quando non c'e' nulla da mostrare.
const COLORI_PRESENZA = {
  live: '#2DD4BF',
  in_ritardo: '#F59E0B',
  non_disponibile: '#A1A1AA',
};

const iconaDriver = (stato) => new L.DivIcon({
  className: 'custom-driver-marker',
  html: `<div style="
  background: ${COLORI_PRESENZA[stato] || COLORI_PRESENZA.live};
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid white;
  box-shadow: 0 0 20px ${COLORI_PRESENZA[stato] || COLORI_PRESENZA.live}80;
">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2">
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
    <path d="M15 18H9"/>
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
    <circle cx="17" cy="18" r="2"/>
    <circle cx="7" cy="18" r="2"/>
  </svg>
</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const pharmacyIcon = new L.DivIcon({
  className: 'custom-pharmacy-marker',
  html: `<div style="
  background: #F59E0B;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid white;
  box-shadow: 0 0 16px rgba(245,158,11,0.6);
">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const deliveryIcon = new L.DivIcon({
  className: 'custom-delivery-marker',
  html: `<div style="
  background: #F43F5E;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 0 15px rgba(244,63,94,0.5);
">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapUpdater({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);

  useEffect(() => {
    let alive = true;
    const handleResize = () => {
      setTimeout(() => {
        if (alive) safeInvalidateSize(map);
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      alive = false;
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

export default function TrackingPage() {
  const { driverLocations } = useSocket();
  const { user } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveryCoords, setDeliveryCoords] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [mapCenter, setMapCenter] = useState([40.8833, 14.4761]);
  const [pharmacyCoords, setPharmacyCoords] = useState(null);
  const mapKey = useRef(`map-${Date.now()}`);

  const queryClient = useQueryClient();
  const { data: piano } = usePlanQuery();
  // Letture dalla cache condivisa; lo stato locale resta la fonte per gli
  // aggiornamenti live del websocket (posizioni dei fattorini).
  const {
    data: driversCache,
    isLoading: driversLoading,
    isError: driversError,
  } = useDriversQuery();
  const {
    data: activeDeliveriesCache,
    isLoading: activeDeliveriesLoading,
  } = useDeliveriesQuery('active');

  useEffect(() => {
    if (!driversCache) return;
    setDrivers(ensureArray(driversCache));
  }, [driversCache]);

  const mapCenteredOnDriver = useRef(false);
  useEffect(() => {
    if (mapCenteredOnDriver.current) return;
    const driverWithLocation = ensureArray(drivers).find((driver) => driver.current_lat && driver.current_lng);
    if (!driverWithLocation) return;
    mapCenteredOnDriver.current = true;
    setMapCenter([driverWithLocation.current_lat, driverWithLocation.current_lng]);
  }, [drivers]);

  useEffect(() => {
    if (!activeDeliveriesCache) return;
    const list = ensureArray(activeDeliveriesCache);
    setDeliveries(list);
    setDeliveryCoords({});
    list
      .filter((delivery) => ['assigned', 'picked_up', 'in_transit'].includes(delivery.status))
      .slice(0, 10)
      .forEach((delivery) => {
        loadDeliveryCoordinates(delivery).catch(() => null);
      });
  }, [activeDeliveriesCache]);

  useEffect(() => {
    if (driversLoading || activeDeliveriesLoading) return;
    if (driversError) {
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [driversLoading, activeDeliveriesLoading, driversError]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadPharmacyCoordinates = async () => {
      const coords = await geocodeWithRateLimit(user?.pharmacy_address);
      if (mounted && coords) {
        setMapCenter([coords.lat, coords.lng]);
        setPharmacyCoords(coords);
      }
    };

    if (user?.pharmacy_address) {
      loadPharmacyCoordinates().catch(() => null);
    }

    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    const safeDriverLocations = ensureObject(driverLocations);
    if (Object.keys(safeDriverLocations).length > 0) {
      setDrivers((prev) => ensureArray(prev).map((driver) => {
        const liveLocation = safeDriverLocations[driver.driver_id];
        if (liveLocation) {
          // La posizione appena ricevuta dal websocket e' fresca per definizione:
          // senza aggiornare l'orario finirebbe classificata come ferma.
          return {
            ...driver,
            current_lat: liveLocation.lat,
            current_lng: liveLocation.lng,
            last_location_update: liveLocation.last_location_update || new Date().toISOString(),
          };
        }
        return driver;
      }));
    }
  }, [driverLocations]);

  const loadDeliveryCoordinates = async (delivery) => {
    try {
      if (delivery?.customer_lat != null && delivery?.customer_lng != null) {
        setDeliveryCoords((prev) => ({
          ...prev,
          [delivery.delivery_id]: { lat: delivery.customer_lat, lng: delivery.customer_lng },
        }));
        return;
      }
      const coords = await geocodeWithRateLimit(delivery?.customer_address);
      if (!coords) return;
      setDeliveryCoords((prev) => ({
        ...prev,
        [delivery.delivery_id]: coords,
      }));
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  };

  const fetchData = async () => {
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['drivers'] }),
        queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
      ]);
    } catch {
      toast.error('Errore nel caricamento dati');
    } finally {
      setLoading(false);
    }
  };

  const handleCenterOnDriver = (driver) => {
    if (driver.current_lat && driver.current_lng) {
      setMapCenter([driver.current_lat, driver.current_lng]);
      setSelectedDriver(driver);
    } else {
      toast.info('Posizione non disponibile per questo fattorino');
    }
  };

  const safeDrivers = ensureArray(drivers);
  const safeDeliveries = ensureArray(deliveries);
  const safeDeliveryCoords = ensureObject(deliveryCoords);
  useEffect(() => {
    const timer = setInterval(() => {
      fetchData().catch(() => null);
    }, 25000);
    return () => clearInterval(timer);
  }, []);

  // Ogni fattorino con il suo stato, deciso dall'orario reale dell'ultima
  // posizione e non dalla semplice presenza di due coordinate salvate.
  const adesso = Date.now();
  const presenze = safeDrivers.map((driver) => ({ driver, ...statoPresenza(driver, adesso) }));
  const perStato = (stato) => presenze.filter((p) => p.stato === stato).map((p) => p.driver);
  const liveDrivers = perStato('live');
  const ritardoDrivers = perStato('in_ritardo');
  const nonDisponibili = perStato('non_disponibile');
  // Sulla mappa finisce chi ha coordinate utilizzabili: i "non disponibili" senza
  // posizione non hanno un punto dove stare.
  const driversSuMappa = presenze.filter((p) => p.stato !== 'non_disponibile').map((p) => p.driver);
  const activeDeliveries = safeDeliveries.filter((delivery) => ['assigned', 'picked_up', 'in_transit'].includes(delivery.status));

  const statusLabels = {
    assigned: 'Assegnata',
    picked_up: 'Ritirata',
    in_transit: 'In consegna',
  };

  if (!funzioneSbloccata(piano, 'tracking_live')) {
    return (
      <Layout title="Tracking">
        <div className="p-4" data-testid="tracking-page"><ProGate funzione="tracking_live" /></div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="Tracking">
        <div className="flex items-center justify-center h-64">
          <div className="spinner"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Tracking">
      <div className="space-y-4" data-testid="tracking-page">
        <Card className={`${liveDrivers.length > 0 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`rounded-2xl p-2 ${liveDrivers.length > 0 ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                {liveDrivers.length > 0 ? <LocateFixed className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">
                  {liveDrivers.length > 0 ? 'Tracking live disponibile' : 'Nessun fattorino live in questo momento'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {liveDrivers.length > 0
                    ? `${liveDrivers.length} fattorin${liveDrivers.length === 1 ? 'o aggiorna' : 'i aggiornano'} la posizione in tempo reale${
                      ritardoDrivers.length > 0 ? `, ${ritardoDrivers.length} con posizione ferma da oltre ${SOGLIA_RITARDO_MIN} minuti` : ''
                    }.`
                    : `I marker verdi compaiono quando il fattorino apre l’app, tocca “Attiva posizione live” e consente la geolocalizzazione. Una posizione ferma da oltre ${SOGLIA_LIVE_MIN} minuti non conta come live.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300" data-testid="tracking-conteggio-live">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />Live: {liveDrivers.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300" data-testid="tracking-conteggio-in-ritardo">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />In ritardo: {ritardoDrivers.length}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground" data-testid="tracking-conteggio-non-disponibile">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground" />Non disponibile: {nonDisponibili.length}
                  </span>
                </div>
                {liveDrivers.length === 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">1. Apri app fattorino</Badge>
                    <Badge variant="outline">2. Attiva posizione live</Badge>
                    <Badge variant="outline">3. Consenti geolocalizzazione</Badge>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col lg:flex-row gap-4 mobile-full-height">
          <Card className="flex-1 bg-card border-border overflow-hidden min-h-[50vh] lg:min-h-0">
            <div className="h-[50vh] min-h-[300px] md:h-[420px] lg:h-full">
              <MapContainer key={mapKey.current} center={mapCenter} zoom={13} className="h-full w-full" zoomControl>
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapUpdater center={mapCenter} />

                {driversSuMappa.map((driver) => {
                  const presenza = statoPresenza(driver, adesso);
                  return (
                  <Marker key={driver.driver_id} position={[driver.current_lat, driver.current_lng]} icon={iconaDriver(presenza.stato)}>
                    <Popup>
                      <div className="text-center p-2">
                        <p className="font-bold text-lg">{driver.name}</p>
                        <p className="text-sm text-gray-600">{driver.vehicle_type}</p>
                        <p className="text-xs text-gray-500">{driver.phone}</p>
                        <p className={`text-xs font-medium mt-1 ${presenza.stato === 'live' ? 'text-emerald-700' : presenza.stato === 'in_ritardo' ? 'text-amber-700' : 'text-zinc-600'}`}>
                          {STATI_PRESENZA[presenza.stato].etichetta} · {testoUltimoAggiornamento(driver, adesso)}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                  );
                })}

                {pharmacyCoords && (
                  <Marker position={[pharmacyCoords.lat, pharmacyCoords.lng]} icon={pharmacyIcon}>
                    <Popup>
                      <div className="text-center p-2">
                        <p className="font-bold text-base">{user?.pharmacy_name || 'La tua farmacia'}</p>
                        <p className="text-sm text-gray-600">{user?.pharmacy_address}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {Object.entries(safeDeliveryCoords).map(([deliveryId, coords]) => {
                  const delivery = safeDeliveries.find((item) => item.delivery_id === deliveryId);
                  if (!delivery) return null;
                  return (
                    <Marker key={deliveryId} position={[coords.lat, coords.lng]} icon={deliveryIcon}>
                      <Popup>
                        <div className="p-2">
                          <p className="font-bold">{delivery.customer_name}</p>
                          <p className="text-sm">{delivery.customer_address}</p>
                          <p className="text-xs text-gray-500 mt-1">{statusLabels[delivery.status]}</p>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          </Card>

          <Card className="w-full lg:w-80 flex-shrink-0 bg-card border-border flex flex-col max-h-[40vh] lg:max-h-none overflow-hidden">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-foreground flex items-center gap-2">
                  <Truck className="w-5 h-5 text-teal-400" />
                  Mappa operativa
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={fetchData} className="h-8 w-8">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-4">
                <SezioneFattorini
                  stato="live"
                  fattorini={liveDrivers}
                  consegneAttive={activeDeliveries}
                  selezionato={selectedDriver}
                  onCentra={handleCenterOnDriver}
                  adesso={adesso}
                />
                <SezioneFattorini
                  stato="in_ritardo"
                  fattorini={ritardoDrivers}
                  consegneAttive={activeDeliveries}
                  selezionato={selectedDriver}
                  onCentra={handleCenterOnDriver}
                  adesso={adesso}
                />
                <SezioneFattorini
                  stato="non_disponibile"
                  fattorini={nonDisponibili}
                  consegneAttive={activeDeliveries}
                  selezionato={selectedDriver}
                  onCentra={handleCenterOnDriver}
                  adesso={adesso}
                />

                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Consegne in corso ({activeDeliveries.length})
                  </h3>
                  {activeDeliveries.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Nessuna consegna attiva</p>
                  ) : (
                    <div className="space-y-2">
                      {activeDeliveries.slice(0, 10).map((delivery) => {
                        const driver = safeDrivers.find((item) => item.driver_id === delivery.driver_id);
                        const delivCoords = safeDeliveryCoords[delivery.delivery_id];
                        const presenza = driver ? statoPresenza(driver, adesso) : null;
                        let distanceKm = null;
                        if (driver?.current_lat && driver?.current_lng && delivCoords) {
                          distanceKm = haversineKm(driver.current_lat, driver.current_lng, delivCoords.lat, delivCoords.lng);
                        }
                        return (
                          <div key={delivery.delivery_id} className="p-3 rounded-lg border border-border bg-secondary/40">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-medium text-foreground text-sm truncate">{delivery.customer_name}</p>
                              <Badge className={`status-${delivery.status} text-xs shrink-0`}>
                                {statusLabels[delivery.status]}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{(delivery.customer_address || '').slice(0, 30)}</span>
                            </p>
                            <div className="flex items-center justify-between gap-2">
                              {driver && (
                                <p className="text-xs text-primary flex items-center gap-1 min-w-0">
                                  <Truck className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{driver.name}</span>
                                  {presenza?.stato === 'in_ritardo' && (
                                    <span className="text-amber-700 dark:text-amber-300 shrink-0">· posizione ferma</span>
                                  )}
                                </p>
                              )}
                              {distanceKm !== null && (
                                <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold shrink-0">
                                  {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}
                                  {' · '}{testoEta(distanceKm)}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-[11px] text-muted-foreground">
                        La distanza e il tempo sono una stima in linea d'aria sulla posizione del fattorino,
                        non il percorso stradale.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>

            <div className="p-3 border-t">
              <p className="text-xs font-medium text-foreground mb-2">Legenda</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 border border-white/60"></div>
                  <span>Fattorino live</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-amber-400 border border-white/60"></div>
                  <span>Posizione ferma</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-amber-600 border border-white/60"></div>
                  <span>Farmacia</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-rose-500 border border-white/60"></div>
                  <span>Consegna</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
