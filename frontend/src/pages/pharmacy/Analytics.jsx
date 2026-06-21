import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import {
  Package, CheckCircle2, XCircle, Clock, TrendingUp,
  Euro, Users, RefreshCw, Calendar, Download,
} from 'lucide-react';
import { toast } from 'sonner';

const PERIODS = [
  { value: 'today', label: 'Oggi' },
  { value: 'week',  label: 'Settimana' },
  { value: 'month', label: 'Mese' },
];

const STATUS_LABELS = {
  da_preparare:   'Da preparare',
  pending:        'In attesa',
  pronta:         'Pronta',
  assigned:       'Assegnata',
  picked_up:      'Ritirata',
  in_transit:     'In consegna',
  delivered:      'Consegnata',
  cancelled:      'Annullata',
  delivered_pending_confirmation: 'In conferma',
};

const STATUS_COLORS = {
  da_preparare:   '#94a3b8',
  pending:        '#94a3b8',
  pronta:         '#3b82f6',
  assigned:       '#8b5cf6',
  picked_up:      '#f59e0b',
  in_transit:     '#f97316',
  delivered:      '#22c55e',
  cancelled:      '#ef4444',
  delivered_pending_confirmation: '#f59e0b',
};

const PIE_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f97316', '#ef4444', '#94a3b8'];

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-2">
        <Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-16" />
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill || p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const [period, setPeriod]     = useState('week');
  const [data, setData]         = useState(null);
  const [hourly, setHourly]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const [ovRes, hrRes] = await Promise.all([
        axios.get(`${API}/analytics/overview`, { params: { period: p }, withCredentials: true }),
        axios.get(`${API}/analytics/hourly`,   { params: { period: p }, withCredentials: true }),
      ]);
      setData(ovRes.data);
      setHourly(hrRes.data);
    } catch {
      toast.error('Errore nel caricamento analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await axios.get(`${API}/analytics/export/csv`, {
        params: { period },
        withCredentials: true,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consegne_${period}_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV scaricato');
    } catch {
      toast.error('Errore esportazione CSV');
    } finally {
      setExporting(false);
    }
  };

  const barData = data
    ? Object.entries(data.status_breakdown || {})
        .map(([s, c]) => ({ name: STATUS_LABELS[s] ?? s, Consegne: c, fill: STATUS_COLORS[s] ?? '#94a3b8' }))
        .sort((a, b) => b.Consegne - a.Consegne)
    : [];

  const pieData = data
    ? [
        { name: 'Consegnate', value: data.completed },
        { name: 'In corso',   value: data.in_progress },
        { name: 'Annullate',  value: data.cancelled },
      ].filter(d => d.value > 0)
    : [];

  const completionRate = data && data.total_deliveries > 0
    ? Math.round((data.completed / data.total_deliveries) * 100)
    : null;

  // Only show hours with any activity (for readability) — or all 24 when period is today
  const hourlyData = hourly?.hourly?.filter(h =>
    period === 'today' ? true : h.count > 0
  ) ?? [];

  const peakHour = hourly?.peak_hour;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Analytics</h1>
            <p className="text-sm text-muted-foreground">Statistiche consegne della tua farmacia</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border overflow-hidden">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    period === p.value
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading}>
              <Download className="w-4 h-4 mr-2" />
              {exporting ? 'Esportazione…' : 'Esporta CSV'}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => load(period)} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : <>
                <StatCard icon={Package}      label="Totale"        value={data.total_deliveries} sub={`${data.daily_avg}/giorno`} />
                <StatCard icon={CheckCircle2} label="Consegnate"    value={data.completed}        color="text-emerald-500" />
                <StatCard icon={Clock}        label="In corso"      value={data.in_progress}      color="text-blue-500" />
                <StatCard icon={XCircle}      label="Annullate"     value={data.cancelled}        color="text-destructive" />
                <StatCard icon={Euro}         label="Entrate prev." value={`€\u00a0${data.revenue.toLocaleString('it-IT',{minimumFractionDigits:2})}`} color="text-emerald-500" />
                <StatCard icon={TrendingUp}   label="Tasso successo" value={completionRate !== null ? `${completionRate}%` : '—'} sub="consegne completate" color={completionRate >= 90 ? 'text-emerald-500' : completionRate >= 70 ? 'text-amber-500' : 'text-destructive'} />
              </>
          }
        </div>

        {/* ── Charts row 1 ── */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" /> Per stato
              </CardTitle>
              <CardDescription>Distribuzione per stato nel periodo</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-52 w-full" />
               : barData.length === 0
                 ? <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">Nessuna consegna</div>
                 : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 50 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Consegne" radius={[4,4,0,0]}>
                        {barData.map((e,i) => <Cell key={i} fill={e.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
            </CardContent>
          </Card>

          {/* Pie chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Esito
              </CardTitle>
              <CardDescription>Completate, in corso e annullate</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-52 w-full" />
               : pieData.length === 0
                 ? <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">Nessuna consegna</div>
                 : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData} cx="50%" cy="45%"
                        innerRadius={52} outerRadius={80}
                        paddingAngle={3} dataKey="value"
                        label={({ name, percent }) => `${(percent*100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {pieData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
            </CardContent>
          </Card>
        </div>

        {/* ── Hourly trend chart ── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Distribuzione oraria
                </CardTitle>
                <CardDescription>Consegne create per fascia oraria (UTC)</CardDescription>
              </div>
              {!loading && peakHour && peakHour.count > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Picco: {peakHour.label} — {peakHour.count} consegne
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" />
             : hourlyData.length === 0
               ? <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Nessun dato disponibile</div>
               : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={hourlyData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={period === 'today' ? 1 : 0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone" dataKey="count" name="Consegne"
                      stroke="hsl(var(--primary))" strokeWidth={2}
                      dot={{ r: 3 }} activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
          </CardContent>
        </Card>

        {/* ── Top drivers ── */}
        {!loading && data?.top_drivers?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Top fattorini
              </CardTitle>
              <CardDescription>I più attivi nel periodo — solo consegne completate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.top_drivers.map((driver, i) => (
                  <div key={driver.driver_id} className="flex items-center gap-4">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                      i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : 'bg-amber-700'
                    }`}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{driver.name}</p>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${(driver.deliveries / (data.top_drivers[0]?.deliveries || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {driver.deliveries} consegne
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Footer ── */}
        {!loading && data?.generated_at && (
          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
            <Calendar className="w-3 h-3" />
            Aggiornato alle {new Date(data.generated_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}
          </p>
        )}
      </div>
    </Layout>
  );
}
