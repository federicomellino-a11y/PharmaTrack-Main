import React, { useState } from 'react';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Button } from '../../components/ui/button';
import {
  Euro, Package, TrendingUp, Truck, CreditCard, Banknote, Trophy, Download, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';
import { useAnalyticsQuery } from '@/hooks/queries';
import { ListSkeleton } from '../../components/Skeletons';

const periodLabels = { week: 'Settimana', month: 'Mese', quarter: 'Trimestre', year: 'Anno' };

const formatCurrency = (amount) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount || 0);

const EmptyState = ({ title, hint }) => (
  <div className="py-10 text-center">
    <p className="font-medium text-muted-foreground">{title}</p>
    <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
  </div>
);

const shortDate = (iso) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const exportCSV = (data, period) => {
  if (!data) { toast.error('Nessun dato da esportare'); return; }
  const s = data.summary || {};
  const rows = [];
  rows.push(['PharmaTrack - Analytics']);
  rows.push([`Periodo: ${periodLabels[period] || period}`]);
  rows.push([`Generato il: ${new Date().toLocaleString('it-IT')}`]);
  rows.push([]);
  rows.push(['RIEPILOGO']);
  rows.push(['Fatturato totale', `€${(s.total_revenue || 0).toFixed(2)}`]);
  rows.push(['Consegne completate', s.delivered_count || 0]);
  rows.push(['Consegne totali', s.total_deliveries || 0]);
  rows.push(['Tasso completamento', `${s.completion_rate || 0}%`]);
  rows.push(['Valore medio ordine', `€${(s.avg_order_value || 0).toFixed(2)}`]);
  rows.push([]);
  const daily = ensureArray(data.daily_revenue);
  if (daily.length) {
    rows.push(['FATTURATO GIORNALIERO']);
    rows.push(['Data', 'Fatturato', 'Consegne']);
    daily.forEach((r) => rows.push([r.date, `€${(r.revenue || 0).toFixed(2)}`, r.count]));
    rows.push([]);
  }
  const top = ensureArray(data.top_customers);
  if (top.length) {
    rows.push(['TOP CLIENTI']);
    rows.push(['Nome', 'Consegne', 'Fatturato']);
    top.forEach((c) => rows.push([c.name, c.deliveries, `€${(c.revenue || 0).toFixed(2)}`]));
    rows.push([]);
  }
  const drv = ensureArray(data.driver_performance);
  if (drv.length) {
    rows.push(['PERFORMANCE FATTORINI']);
    rows.push(['Nome', 'Consegne', 'Fatturato gestito']);
    drv.forEach((d) => rows.push([d.name, d.deliveries, `€${(d.revenue || 0).toFixed(2)}`]));
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pharmatrack-analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success('CSV esportato con successo');
};

const KpiCard = ({ label, value, sub, icon: Icon, tint }) => (
  <Card className="stat-modern">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold" style={tint ? { color: tint } : undefined}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${tint || 'hsl(173,80%,40%)'}1a` }}>
          <Icon className="w-5 h-5" style={{ color: tint || 'hsl(173,80%,40%)' }} />
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function ReportsPage() {
  const [period, setPeriod] = useState('month');
  const { data, isLoading, isError } = useAnalyticsQuery(period);

  if (isLoading) {
    return (
      <Layout title="Report">
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-secondary/40 animate-pulse" />)}
          </div>
          <ListSkeleton rows={6} />
        </div>
      </Layout>
    );
  }

  if (isError || !data) {
    return (
      <Layout title="Report">
        <EmptyState title="Errore nel caricamento" hint="Riprova tra qualche istante." />
      </Layout>
    );
  }

  const s = data.summary || {};
  const daily = ensureArray(data.daily_revenue);
  const topCustomers = ensureArray(data.top_customers);
  const drivers = ensureArray(data.driver_performance);
  const cash = data.payment_split?.cash || { revenue: 0, count: 0 };
  const pos = data.payment_split?.pos || { revenue: 0, count: 0 };
  const paymentData = [
    { name: 'Contanti', value: cash.revenue || 0, count: cash.count || 0, color: 'hsl(142,76%,36%)' },
    { name: 'POS', value: pos.revenue || 0, count: pos.count || 0, color: 'hsl(199,89%,48%)' },
  ];
  const hasRevenue = daily.some((d) => (d.revenue || 0) > 0);

  return (
    <Layout title="Report">
      <div className="space-y-6" data-testid="reports-page">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Report & Analytics</h1>
            <p className="text-muted-foreground">Andamento fatturato e performance del team</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => exportCSV(data, period)} className="gap-2" data-testid="export-csv-btn">
              <Download className="w-4 h-4" />Esporta CSV
            </Button>
            <Tabs value={period} onValueChange={setPeriod}>
              <TabsList data-testid="period-tabs">
                <TabsTrigger value="week">Settimana</TabsTrigger>
                <TabsTrigger value="month">Mese</TabsTrigger>
                <TabsTrigger value="quarter">Trimestre</TabsTrigger>
                <TabsTrigger value="year">Anno</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Fatturato" value={formatCurrency(s.total_revenue)} sub={periodLabels[period]} icon={Euro} tint="hsl(173,80%,40%)" />
          <KpiCard label="Consegne completate" value={s.delivered_count || 0} sub={`su ${s.total_deliveries || 0} totali`} icon={Package} tint="hsl(199,89%,48%)" />
          <KpiCard label="Media ordine" value={formatCurrency(s.avg_order_value)} sub="Per consegna" icon={TrendingUp} tint="hsl(45,93%,47%)" />
          <KpiCard label="Completamento" value={`${s.completion_rate || 0}%`} sub={`${s.cancelled || 0} annullate`} icon={CheckCircle2} tint="hsl(142,71%,45%)" />
        </div>

        {/* Revenue trend */}
        <Card className="card-exclusive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Andamento fatturato
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasRevenue ? (
              <EmptyState title="Nessun fatturato nel periodo" hint="Il grafico si popola con le consegne completate." />
            ) : (
              <div className="h-72" data-testid="revenue-trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ left: 4, right: 12, top: 8 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(173,80%,40%)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(173,80%,40%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `€${Math.round(v)}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      formatter={(value, name) => (name === 'revenue' ? [formatCurrency(value), 'Fatturato'] : [value, 'Consegne'])}
                      labelFormatter={(l) => shortDate(l)}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(173,80%,40%)" strokeWidth={2} fill="url(#revGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Top customers */}
          <Card className="card-exclusive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Top clienti per fatturato
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCustomers.length === 0 ? (
                <EmptyState title="Nessun dato disponibile" hint="Attendi le prime consegne completate." />
              ) : (
                <div className="h-72" data-testid="top-customers-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topCustomers} layout="vertical" margin={{ left: 16, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `€${Math.round(v)}`} />
                      <YAxis dataKey="name" type="category" width={120} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        formatter={(value, name) => (name === 'revenue' ? [formatCurrency(value), 'Fatturato'] : [value, 'Consegne'])}
                      />
                      <Bar dataKey="revenue" fill="hsl(173,80%,40%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment split */}
          <Card className="card-exclusive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-500" />
                Fatturato per metodo di pagamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentData.every((e) => e.value === 0) ? (
                <EmptyState title="Ancora nessun pagamento" hint="Qui vedrai il mix tra contanti e POS." />
              ) : (
                <div className="h-72 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentData} cx="50%" cy="50%" innerRadius={60} outerRadius={82} paddingAngle={5}
                        dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {paymentData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(value, name, item) => [formatCurrency(value), `${item.payload.name} (${item.payload.count} consegne)`]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Driver ranking */}
          <Card className="card-exclusive lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-purple-500" />
                Classifica fattorini
              </CardTitle>
            </CardHeader>
            <CardContent>
              {drivers.length === 0 ? (
                <EmptyState title="Nessun fattorino in classifica" hint="Le performance appariranno con le consegne completate." />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4" data-testid="driver-ranking">
                  {drivers.map((driver, index) => (
                    <div key={driver.driver_id} className="p-4 rounded-xl bg-secondary/30 text-center">
                      <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-2 ${
                        index === 0 ? 'bg-amber-500/20 text-amber-500'
                          : index === 1 ? 'bg-zinc-400/20 text-zinc-400'
                            : index === 2 ? 'bg-orange-600/20 text-orange-600'
                              : 'bg-primary/10 text-primary'}`}>
                        {index < 3 ? <Trophy className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                      </div>
                      <p className="font-semibold">{driver.name}</p>
                      <p className="text-2xl font-bold text-primary">{driver.deliveries}</p>
                      <p className="text-xs text-muted-foreground">consegne</p>
                      <p className="mt-2 text-sm font-medium text-foreground">{formatCurrency(driver.revenue)}</p>
                      <p className="text-[11px] text-muted-foreground">fatturato gestito</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
