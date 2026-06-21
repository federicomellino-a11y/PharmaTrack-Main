import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import {
  Package, CheckCircle2, XCircle, Clock, TrendingUp,
  Euro, Users, RefreshCw, Calendar,
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

const PIE_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f97316', '#ef4444', '#94a3b8', '#f59e0b'];

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
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-16" />
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
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const [period, setPeriod]   = useState('week');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/analytics/overview`, {
        params: { period: p },
        withCredentials: true,
      });
      setData(res.data);
    } catch (err) {
      toast.error('Errore nel caricamento analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  // Build bar chart data from status_breakdown
  const barData = data
    ? Object.entries(data.status_breakdown || {}).map(([status, count]) => ({
        name: STATUS_LABELS[status] ?? status,
        Consegne: count,
        fill: STATUS_COLORS[status] ?? '#94a3b8',
      }))
    : [];

  // Build pie data: delivered vs others
  const pieData = data
    ? [
        { name: 'Consegnate',  value: data.completed },
        { name: 'In corso',    value: data.in_progress },
        { name: 'Annullate',   value: data.cancelled },
      ].filter(d => d.value > 0)
    : [];

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Analytics</h1>
            <p className="text-sm text-muted-foreground">Statistiche consegne della tua farmacia</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              {PERIODS.map((p) => (
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
            <Button variant="ghost" size="icon" onClick={() => load(period)} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard icon={Package}      label="Totale"       value={data.total_deliveries} sub={`${data.daily_avg}/giorno`} />
              <StatCard icon={CheckCircle2} label="Consegnate"   value={data.completed}        color="text-emerald-500" />
              <StatCard icon={Clock}        label="In corso"     value={data.in_progress}      color="text-blue-500" />
              <StatCard icon={XCircle}      label="Annullate"    value={data.cancelled}        color="text-destructive" />
              <StatCard icon={Euro}         label="Entrate prev." value={`€ ${data.revenue.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`} color="text-emerald-500" />
              <StatCard icon={TrendingUp}   label="Media/giorno" value={data.daily_avg}        sub={PERIODS.find(p => p.value === period)?.label} />
            </>
          )}
        </div>

        {/* Charts row */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Bar chart — consegne per stato */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" /> Consegne per stato
              </CardTitle>
              <CardDescription>Distribuzione degli stati nel periodo selezionato</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-52 w-full" />
              ) : barData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                  Nessuna consegna nel periodo
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} margin={{ top: 4, right: 8, left: -20, bottom: 40 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Consegne" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Pie chart — completate vs altri */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Esito consegne
              </CardTitle>
              <CardDescription>Completate, in corso e annullate</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-52 w-full" />
              ) : pieData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                  Nessuna consegna nel periodo
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top drivers */}
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
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : 'bg-amber-700'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{driver.name}</p>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${(driver.deliveries / (data.top_drivers[0]?.deliveries || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {driver.deliveries} consegne
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer timestamp */}
        {!loading && data?.generated_at && (
          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
            <Calendar className="w-3 h-3" />
            Aggiornato alle {new Date(data.generated_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </Layout>
  );
}
