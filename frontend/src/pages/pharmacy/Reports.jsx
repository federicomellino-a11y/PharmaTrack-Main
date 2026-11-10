import React, { useState } from 'react';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Button } from '../../components/ui/button';
import { Euro, Package, TrendingUp, Truck, CreditCard, Trophy, CheckCircle2, Clock, XCircle, Users, BarChart3, Printer } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { ensureArray } from '@/lib/collections';
import { useAnalyticsQuery } from '@/hooks/queries';
import { ListSkeleton } from '../../components/Skeletons';

import { formatCurrency } from '@/lib/format';
const periodLabels = { week: 'Settimana', month: 'Mese', quarter: 'Trimestre', year: 'Anno' };
const minuti = (valore) => Number(valore || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 });
const GIORNI_LUNGHI = { lun: 'lunedì', mar: 'martedì', mer: 'mercoledì', gio: 'giovedì', ven: 'venerdì', sab: 'sabato', dom: 'domenica' };


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

  const tempi = data.delivery_times || {};
  const motivi = ensureArray(data.failures?.by_reason);
  const perOra = ensureArray(data.by_hour);
  const daRichiamare = ensureArray(data.lapsed_customers);
  const massimoOra = Math.max(1, ...perOra.map((v) => v.count || 0));
  const perGiorno = ensureArray(data.by_weekday);
  const massimoGiorno = Math.max(1, ...perGiorno.map((v) => v.count || 0));
  const punta = data.busiest || {};
  const senzaFattorino = Number(data.open_without_driver || 0);
  const massimoMotivo = Math.max(1, ...motivi.map((v) => v.count || 0));

  return (
    <Layout title="Report">
      <div className="space-y-6" data-testid="reports-page">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Report & Analytics</h1>
            <p className="text-muted-foreground">Andamento fatturato e performance del team</p>
          </div>
          <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-2"
            data-testid="print-report-btn"
            title="Stampa o salva come PDF: nel dialogo di stampa scegli 'Salva come PDF'"
          >
              <Printer className="w-4 h-4" />Stampa / PDF
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
          {/* Tempi di consegna */}
          <Card className="card-exclusive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-sky-500" />
                Quanto ci mette il giro
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tempi.sampled ? (
                <div className="space-y-4" data-testid="delivery-times">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Media</p>
                      <p className="text-3xl font-black tabular-nums">{minuti(tempi.avg_minutes)}<span className="text-sm font-medium text-muted-foreground ml-1">min</span></p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Metà delle volte</p>
                      <p className="text-3xl font-black tabular-nums">{minuti(tempi.median_minutes)}<span className="text-sm font-medium text-muted-foreground ml-1">min</span></p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ensureArray(tempi.by_driver).map((riga) => (
                      <div key={riga.name} className="flex items-center justify-between text-sm">
                        <span className="truncate">{riga.name}</span>
                        <span className="tabular-nums font-medium">{minuti(riga.avg_minutes)} min <span className="text-xs text-muted-foreground font-normal">({riga.count})</span></span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Dalla creazione dell'ordine alla consegna confermata, su {tempi.sampled} consegne.</p>
                </div>
              ) : (
                <EmptyState title="Dati insufficienti" hint="Servono consegne completate con data di consegna." />
              )}
            </CardContent>
          </Card>

          {/* Motivi di mancata consegna */}
          <Card className="card-exclusive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-500" />
                Perché non è arrivata
              </CardTitle>
            </CardHeader>
            <CardContent>
              {motivi.length === 0 ? (
                <EmptyState title="Nessuna consegna fallita" hint="Nel periodo scelto non ci sono consegne non riuscite." />
              ) : (
                <div className="space-y-3" data-testid="failure-reasons">
                  {motivi.map((voce) => (
                    <div key={voce.reason}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="truncate">{voce.reason}</span>
                        <span className="tabular-nums font-medium">{voce.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-rose-500" style={{ width: `${Math.round((voce.count / massimoMotivo) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quando arrivano le richieste */}
          <Card className="card-exclusive lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                Quando arrivano le richieste
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-28" data-testid="by-hour">
                {perOra.map((voce) => (
                  <div key={voce.hour} className="flex-1 flex flex-col items-center justify-end gap-1">
                    <div
                      className="w-full rounded-t bg-primary/70"
                      style={{ height: `${Math.max(2, Math.round((voce.count / massimoOra) * 100))}%` }}
                      title={`${voce.hour}:00 · ${voce.count} richieste`}
                    />
                    {voce.hour % 3 === 0 && <span className="text-[10px] text-muted-foreground">{voce.hour}</span>}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Ora in cui la farmacia crea l'ordine: serve a decidere quando avere il fattorino in piedi.</p>
              {punta.hour != null && (
                <p className="mt-2 text-sm">
                  Il momento più carico è <span className="font-semibold">alle {punta.hour}</span>
                  {punta.weekday ? <> e il giorno è <span className="font-semibold">{GIORNI_LUNGHI[punta.weekday] || punta.weekday}</span></> : null}.
                </p>
              )}
              {perGiorno.length > 0 && (
                <div className="mt-4 flex items-end gap-2" data-testid="by-weekday">
                  {perGiorno.map((voce) => (
                    <div key={voce.day} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-primary/40"
                        style={{ height: `${Math.max(3, Math.round(((voce.count || 0) / massimoGiorno) * 56))}px` }}
                        title={`${voce.day}: ${voce.count || 0} richieste`}
                      />
                      <span className="text-[10px] uppercase text-muted-foreground">{voce.day}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Clienti da richiamare */}
          <Card className="card-exclusive lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-500" />
                Pazienti da richiamare
              </CardTitle>
            </CardHeader>
            <CardContent>
              {daRichiamare.length === 0 ? (
                <EmptyState title="Nessuno da richiamare" hint="Chi ordinava spesso ha ordinato di recente." />
              ) : (
                <div className="divide-y divide-border/60" data-testid="lapsed-customers">
                  {daRichiamare.map((cliente) => (
                    <div key={cliente.customer_id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{cliente.name || 'Cliente'}</p>
                        <p className="text-xs text-muted-foreground">
                          {cliente.deliveries} consegne · ultima il {cliente.last_delivery}
                        </p>
                      </div>
                      <Badge variant="secondary" className="tabular-nums shrink-0">{cliente.days_since} giorni</Badge>
                    </div>
                  ))}
                  <p className="pt-2 text-[11px] text-muted-foreground">
                    Chi ordinava almeno due volte e non ordina da 45 giorni. L'importo cambia ogni volta, la persona no.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
