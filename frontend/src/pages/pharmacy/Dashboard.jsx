import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Package, Users, Truck, Clock, CheckCircle2, Plus, UserPlus,
  MapPin, TrendingUp, ArrowRight, AlertCircle, Euro, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';
import { geocodeAddress as geocodeWithRateLimit } from '../../lib/geocoding';
import { ensureArray, ensureObject } from '@/lib/collections';


delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const customerIcon = new L.DivIcon({
  className: '',
  html: `<div style="background:hsl(172,66%,33%);width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [12, 12], iconAnchor: [6, 6],
});

const pharmacyIcon = new L.DivIcon({
  className: '',
  html: `<div style="background:hsl(45,93%,47%);width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
});

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 200);
    const h = () => setTimeout(() => map.invalidateSize(), 100);
    window.addEventListener('resize', h);
    return () => { clearTimeout(t); window.removeEventListener('resize', h); };
  }, [map]);
  return null;
}

const formatCurrency = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0);


export default function PharmacyDashboard() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentDeliveries, setRecentDeliveries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerCoords, setCustomerCoords] = useState({});
  const [pharmacyCoords, setPharmacyCoords] = useState(null);
  const [loading, setLoading] = useState(true);
  const mapKey = useRef(`dash-map-${Date.now()}`);

  const loadCustomerCoordinates = useCallback(async (customer) => {
    if (!customer?.customer_id) return;
    if (customer.customer_lat != null && customer.customer_lng != null) {
      setCustomerCoords(prev => ({
        ...prev,
        [customer.customer_id]: { lat: customer.customer_lat, lng: customer.customer_lng },
      }));
      return;
    }
    const coords = await geocodeWithRateLimit(customer?.address);
    if (!coords) return;
    setCustomerCoords(prev => ({ ...prev, [customer.customer_id]: coords }));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, deliveriesRes, customersRes] = await Promise.all([
        axios.get(`${API}/statistics`, { withCredentials: true }),
        axios.get(`${API}/deliveries?status=active`, { withCredentials: true }),
        axios.get(`${API}/customers`, { withCredentials: true }),
      ]);
      const safeDeliveries = ensureArray(deliveriesRes.data);
      const safeCustomers = ensureArray(customersRes.data);
      setStats(statsRes.data);
      setRecentDeliveries(safeDeliveries.slice(0, 6));
      setCustomers(safeCustomers);
      setCustomerCoords({});
      safeCustomers.slice(0, 20).forEach((customer) => {
        loadCustomerCoordinates(customer).catch(() => null);
      });
    } catch {
      toast.error('Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [loadCustomerCoordinates]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    let mounted = true;

    const loadPharmacyCoordinates = async () => {
      if (user?.pharmacy_lat != null && user?.pharmacy_lng != null) {
        if (mounted) {
          setPharmacyCoords({ lat: user.pharmacy_lat, lng: user.pharmacy_lng });
        }
        return;
      }
      const coords = await geocodeWithRateLimit(user?.pharmacy_address);
      if (mounted && coords) {
        setPharmacyCoords(coords);
      }
    };

    if (user?.pharmacy_address || (user?.pharmacy_lat != null && user?.pharmacy_lng != null)) {
      loadPharmacyCoordinates().catch(() => null);
    }

    return () => {
      mounted = false;
    };
  }, [user]);
  const statusLabels = { pending: 'In attesa', assigned: 'Assegnata', picked_up: 'Ritirata', in_transit: 'In consegna' };

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center h-64">
        <div className="spinner" />
      </div>
    </Layout>
  );

  const safeRecentDeliveries = ensureArray(recentDeliveries);
  const safeCustomers = ensureArray(customers);
  const customerCoordEntries = Object.entries(ensureObject(customerCoords));
  const firstCustomerCoord = customerCoordEntries[0]?.[1];

  const mapCenter = pharmacyCoords
    ? [pharmacyCoords.lat, pharmacyCoords.lng]
    : firstCustomerCoord
      ? [firstCustomerCoord.lat, firstCustomerCoord.lng]
      : [40.8833, 14.4761];

  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = '&copy; OpenStreetMap contributors';

  const kpis = [
    { label: 'Consegne oggi', value: stats?.deliveries?.today || 0, sub: `${stats?.deliveries?.today_completed || 0} completate`, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'In corso', value: stats?.deliveries?.active || 0, sub: `${stats?.deliveries?.pending || 0} in attesa`, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10', alert: (stats?.deliveries?.pending || 0) > 3 },
    { label: 'Completate', value: stats?.deliveries?.completed || 0, sub: 'Totale storico', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    { label: 'Fattorini attivi', value: stats?.drivers?.active || 0, sub: `su ${stats?.drivers?.total || 0} totali`, icon: Truck, color: 'text-blue-600', bg: 'bg-blue-500/10' },
  ];

  const weeklyChartData = ensureArray(stats?.weekly).map((entry) => ({
    day: entry.day,
    completed: Number(entry.completed || 0),
  }));
  const hasWeeklyActivity = weeklyChartData.some((entry) => entry.completed > 0);

  return (
    <Layout title="Dashboard">
      <div className="space-y-5 animate-fade-in-up" data-testid="pharmacy-dashboard">

        {/* Welcome banner */}
        <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/15 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold">
              Buongiorno{user?.name ? `, ${user.name.split(' ')[0]}` : ''}! 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {user?.pharmacy_name || 'La tua farmacia'} · {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <Button className="btn-primary shrink-0" size="sm" onClick={() => navigate('/deliveries?new=true')}>
            <Plus className="w-4 h-4 mr-1.5" />Nuova
          </Button>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { to: '/deliveries?new=true', icon: Plus, label: 'Consegna', color: 'text-primary', bg: 'bg-primary/10' },
            { to: '/customers?new=true', icon: UserPlus, label: 'Cliente', color: 'text-blue-600', bg: 'bg-blue-500/10' },
            { to: '/drivers', icon: Truck, label: 'Fattorini', color: 'text-purple-600', bg: 'bg-purple-500/10' },
            { to: '/reports', icon: BarChart3, label: 'Report', color: 'text-amber-600', bg: 'bg-amber-500/10' },
          ].map(({ to, icon: Icon, label, color, bg }) => (
            <Link key={to} to={to} className="quick-action">
              <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
            </Link>
          ))}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <Card key={kpi.label} className={`stat-modern animate-slide-up stagger-${i}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                  {kpi.alert && <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <p className="text-3xl font-black tracking-tight">{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mt-3`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Map + Chart */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="card-exclusive overflow-hidden">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Mappa Clienti
                <span className="text-xs text-muted-foreground font-normal ml-auto">
                  {Object.keys(customerCoords).length} clienti
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-56 md:h-64">
                <MapContainer key={mapKey.current} center={mapCenter} zoom={13} className="h-full w-full" zoomControl={false}>
                  <TileLayer attribution={tileAttribution} url={tileUrl} />
                  <MapResizer />
                  {pharmacyCoords && (
                    <Marker position={[pharmacyCoords.lat, pharmacyCoords.lng]} icon={pharmacyIcon}>
                      <Popup><div className="text-center text-xs"><strong>📍 {user?.pharmacy_name || 'Farmacia'}</strong><br />{user?.pharmacy_address}</div></Popup>
                    </Marker>
                  )}
                  {customerCoordEntries.map(([id, c]) => {
                    const customer = safeCustomers.find(x => x.customer_id === id);
                    return customer ? (
                      <Marker key={id} position={[c.lat, c.lng]} icon={customerIcon}>
                        <Popup><div className="text-xs"><strong>{customer.name}</strong><br />{customer.address}</div></Popup>
                      </Marker>
                    ) : null;
                  })}
                </MapContainer>
              </div>
              <div className="px-4 py-2.5 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>La tua farmacia</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary inline-block"></span>Clienti</span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-exclusive">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Andamento Settimana
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              <div className="h-56 md:h-[264px]">
                {hasWeeklyActivity ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(221,83%,53%)" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="hsl(221,83%,53%)" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Area type="monotone" dataKey="completed" stroke="hsl(221,83%,53%)" strokeWidth={3} fill="url(#gComp)" name="Completate" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground px-6">
                    <TrendingUp className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm font-medium">Nessuna consegna completata questa settimana</p>
                    <p className="text-xs mt-1">Il grafico apparirà appena saranno disponibili dati reali.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent deliveries */}
        <Card className="card-exclusive">
          <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />Consegne Attive
            </CardTitle>
            <Button variant="ghost" size="sm" asChild className="text-xs text-primary h-7">
              <Link to="/deliveries">Vedi tutte <ArrowRight className="w-3 h-3 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {safeRecentDeliveries.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nessuna consegna attiva</p>
                <Button size="sm" className="btn-primary mt-3" onClick={() => navigate('/deliveries?new=true')}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Crea Consegna
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {safeRecentDeliveries.map(d => (
                  <div key={d.delivery_id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{d.customer_name}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />{d.customer_address}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {d.amount && <span className="text-sm font-bold text-primary">{formatCurrency(d.amount)}</span>}
                      <Badge className={`status-${d.status} text-xs`}>{statusLabels[d.status]}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Clienti', value: stats?.customers?.total || 0, icon: Users, to: '/customers' },
            { label: 'Annullate', value: stats?.deliveries?.cancelled || 0, icon: AlertCircle, to: '/archive' },
            { label: 'Tot. Consegne', value: stats?.deliveries?.total || 0, icon: Package, to: '/archive' },
          ].map(({ label, value, icon: Icon, to }) => (
            <Link key={label} to={to} className="card-exclusive card-interactive p-4 rounded-xl text-center block">
              <p className="text-2xl font-black">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
