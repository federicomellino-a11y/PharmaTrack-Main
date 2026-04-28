import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { 
  ArrowLeft, MapPin, Phone, Package, Navigation, 
  Clock, CheckCircle2, Truck, Play, MessageSquare, LogOut,
  Euro, Banknote, CreditCard, Calculator
} from 'lucide-react';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';
import { geocodeAddress as geocodeWithRateLimit } from '../../lib/geocoding';
import { useDriverAuth } from '../../contexts/DriverAuthContext';


// Fix Leaflet marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function DriverDeliveryDetail() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();
  const { logout } = useDriverAuth();
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [coordinates, setCoordinates] = useState(null);

  useEffect(() => {
    fetchDelivery();
  }, [deliveryId]);

  const fetchDelivery = async () => {
    try {
      const response = await axios.get(`${API}/driver/deliveries`, { withCredentials: true });
      const found = response.data.find(d => d.delivery_id === deliveryId);
      if (found) {
        setDelivery(found);
        if (found.customer_lat != null && found.customer_lng != null) {
          setCoordinates({ lat: found.customer_lat, lng: found.customer_lng });
        } else {
          loadCoordinates(found.customer_address).catch(() => null);
        }
      } else {
        toast.error('Consegna non trovata');
        navigate('/driver');
      }
    } catch (err) {
      toast.error('Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  };

  const loadCoordinates = async (address) => {
    try {
      const coords = await geocodeWithRateLimit(address);
      if (coords) {
        setCoordinates(coords);
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
  };

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      await axios.put(`${API}/driver/deliveries/${deliveryId}/status`, 
        { status: newStatus },
        { withCredentials: true }
      );
      
      const statusMessages = {
        picked_up: 'Consegna ritirata',
        in_transit: 'In consegna',
        delivered: 'Consegna completata!'
      };
      
      toast.success(statusMessages[newStatus]);
      
      if (newStatus === 'delivered') {
        navigate('/driver');
      } else {
        fetchDelivery();
      }
    } catch (err) {
      toast.error('Errore aggiornamento stato');
    } finally {
      setUpdating(false);
    }
  };

  const statusLabels = {
    assigned: 'Da ritirare',
    picked_up: 'Ritirata',
    in_transit: 'In consegna',
    delivered: 'Consegnata'
  };

  const getNextAction = () => {
    switch (delivery?.status) {
      case 'assigned':
        return { label: 'Ritira', status: 'picked_up', icon: Package };
      case 'picked_up':
        return { label: 'Parti', status: 'in_transit', icon: Play };
      case 'in_transit':
        return { label: 'Consegnato', status: 'delivered', icon: CheckCircle2 };
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-[#09090B]">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!delivery) {
    return null;
  }

  const nextAction = getNextAction();

  return (
    <div className="dark min-h-screen bg-[#09090B] pb-24" data-testid="delivery-detail">
      {/* Map */}
      <div className="h-64 relative">
        {coordinates ? (
          <MapContainer
            center={[coordinates.lat, coordinates.lng]}
            zoom={15}
            className="h-full w-full"
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[coordinates.lat, coordinates.lng]}>
              <Popup>
                <div className="text-center">
                  <strong>{delivery.customer_name}</strong>
                  <br />
                  {delivery.customer_address}
                </div>
              </Popup>
            </Marker>
          </MapContainer>
        ) : (
          <div className="h-full w-full bg-zinc-900 flex items-center justify-center">
            <MapPin className="w-8 h-8 text-zinc-700" />
          </div>
        )}

        {/* Back button */}
        <button 
          onClick={() => navigate('/driver')}
          className="absolute top-4 left-4 z-[1000] w-10 h-10 rounded-full glass flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 -mt-6 relative z-10">
        <Card className="bg-zinc-900/95 border-zinc-800 backdrop-blur-sm rounded-t-3xl">
          <CardContent className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-white">{delivery.customer_name}</h1>
                <div className="flex gap-2 mt-2">
                  <Badge className={`status-${delivery.status}`}>
                    {statusLabels[delivery.status]}
                  </Badge>

                </div>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50">
                <MapPin className="w-5 h-5 text-teal-400 mt-0.5" />
                <div>
                  <p className="text-sm text-zinc-400">Indirizzo</p>
                  <p className="text-white">{delivery.customer_address}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
                <Phone className="w-5 h-5 text-teal-400" />
                <div className="flex-1">
                  <p className="text-sm text-zinc-400">Telefono</p>
                  <a href={`tel:${delivery.customer_phone}`} className="text-white hover:text-teal-400">
                    {delivery.customer_phone}
                  </a>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-teal-500/50 text-teal-400"
                  asChild
                >
                  <a href={`tel:${delivery.customer_phone}`}>
                    Chiama
                  </a>
                </Button>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50">
                <Package className="w-5 h-5 text-teal-400 mt-0.5" />
                <div>
                  <p className="text-sm text-zinc-400">Note</p>
                  <p className="text-white">{delivery.notes || 'Nessuna nota'}</p>
                </div>
              </div>

              {delivery.notes && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-sm text-amber-400">Note: {delivery.notes}</p>
                </div>
              )}

              {/* Payment Info */}
              {delivery.amount && (
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-zinc-400">Pagamento</span>
                    <div className="flex items-center gap-2">
                      {delivery.payment_method === 'cash' ? (
                        <>
                          <Banknote className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400 text-sm">Contanti</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 text-blue-400" />
                          <span className="text-blue-400 text-sm">POS</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-center mb-3">
                    <p className="text-sm text-zinc-500">Da incassare</p>
                    <p className="text-3xl font-bold text-white">
                      {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(delivery.amount)}
                    </p>
                  </div>

                  {delivery.payment_method === 'cash' && delivery.change_due > 0 && (
                    <div className="p-3 rounded-lg bg-amber-500/20 border border-amber-500/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calculator className="w-5 h-5 text-amber-400" />
                          <div>
                            <p className="text-xs text-amber-400/80">Cliente paga con</p>
                            <p className="text-lg font-bold text-amber-400">
                              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(delivery.amount_given)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-amber-400/80">Resto da dare</p>
                          <p className="text-xl font-bold text-amber-400">
                            {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(delivery.change_due)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {/* Navigate button */}
              <Button 
                variant="outline"
                className="w-full border-zinc-700 text-zinc-200 hover:text-white hover:border-zinc-500"
                asChild
              >
                <a 
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.customer_address)}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <Navigation className="w-4 h-4 mr-2" />
                  Naviga con Google Maps
                </a>
              </Button>

              {/* Status update button */}
              {nextAction && (
                <Button 
                  className="w-full btn-glow bg-teal-500 hover:bg-teal-600 text-black font-semibold py-6"
                  onClick={() => updateStatus(nextAction.status)}
                  disabled={updating}
                  data-testid={`update-status-${nextAction.status}`}
                >
                  <nextAction.icon className="w-5 h-5 mr-2" />
                  {updating ? 'Aggiornamento...' : nextAction.label}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Navigation */}
      <nav className="mobile-nav">
        <div className="flex justify-around">
          <Link to="/driver" className="mobile-nav-item">
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
