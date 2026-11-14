import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '@/lib/config';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { useAuth } from '../../contexts/AuthContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Package, Users, Truck, Clock, CheckCircle2, Plus, MapPin, TrendingUp,
  ArrowRight, AlertCircle, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/collections';
import {
  useStatisticsQuery, useDeliveriesQuery, useCustomersQuery, useDriversQuery,
  useShiftsQuery, usePlanQuery,
} from '@/hooks/queries';
import { DashboardSkeleton } from '../../components/Skeletons';
import MeseInCorso from '../../components/dashboard/MeseInCorso';
import DaGestireOra from '../../components/dashboard/DaGestireOra';
import RiepilogoFattorini from '../../components/dashboard/RiepilogoFattorini';
import ConsegneInCorso from '../../components/dashboard/ConsegneInCorso';

import { STATUS_LABELS as statusLabels } from '@/lib/deliveryDisplay';
import { formatCurrency } from '@/lib/format';
import { funzioneAttiva } from '@/lib/funzioniFarmacia';
import { funzioneSbloccata } from '@/lib/funzioniPro';
import { costruisciDaGestire, totaleDaGestire } from '@/lib/homeUrgenti';

export default function PharmacyDashboard() {
  const navigate = useNavigate();
  const openNewDelivery = () => {
    if (window.location.pathname === '/deliveries') {
      window.dispatchEvent(new Event('pt:new-delivery'));
      return;
    }
    navigate('/deliveries?new=true');
  };
  const { user } = useAuth();
  const [resending, setResending] = useState(false);

  const { data: stats } = useStatisticsQuery();
  const { data: activeDeliveries = [] } = useDeliveriesQuery('active');
  const { data: customers = [], isLoading: customersLoading } = useCustomersQuery();
  const { data: drivers = [] } = useDriversQuery();
  const { data: piano } = usePlanQuery();
  // I turni sono una funzione Professional: se non c'e', non si chiede nulla
  // al server (che risponderebbe 402) e la voce non compare.
  const turniSbloccati = funzioneSbloccata(piano, 'turni_cassa');
  const { data: turni = [] } = useShiftsQuery({ enabled: turniSbloccati });

  const loading = stats === undefined && customersLoading;
  const consegne = ensureArray(activeDeliveries);

  const resendVerification = useCallback(async () => {
    setResending(true);
    try {
      await axios.post(`${API}/auth/resend-verification`, {}, { withCredentials: true });
      toast.success('Email di verifica inviata. Controlla la casella di posta.');
    } catch {
      toast.error('Impossibile inviare l\'email ora. Riprova tra poco.');
    } finally {
      setResending(false);
    }
  }, []);

  const vociDaGestire = useMemo(() => costruisciDaGestire({
    consegne,
    fattorini: ensureArray(drivers),
    turni: ensureArray(turni),
    turniDisponibili: turniSbloccati,
  }), [consegne, drivers, turni, turniSbloccati]);

  if (loading) return (
    <Layout title="Dashboard">
      <DashboardSkeleton />
    </Layout>
  );

  const kpis = [
    { to: '/deliveries', label: 'Consegne oggi', value: stats?.deliveries?.today || 0, sub: `${stats?.deliveries?.today_completed || 0} completate`, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
    { to: '/deliveries', label: 'In corso', value: stats?.deliveries?.active || 0, sub: `${stats?.deliveries?.pending || 0} in attesa`, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-500/10', alert: (stats?.deliveries?.pending || 0) > 3 },
    { to: '/archive', label: 'Completate', value: stats?.deliveries?.completed || 0, sub: 'Totale storico', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    { to: '/drivers', label: 'Fattorini attivi', value: stats?.drivers?.active || 0, sub: `su ${stats?.drivers?.total || 0} totali`, icon: Truck, color: 'text-blue-600', bg: 'bg-blue-500/10' },
  ];

  const weeklyChartData = ensureArray(stats?.weekly).map((entry) => ({
    day: entry.day,
    completed: Number(entry.completed || 0),
  }));
  const hasWeeklyActivity = weeklyChartData.some((entry) => entry.completed > 0);
  const cassaInHome = funzioneAttiva(user, 'cassa_home');

  return (
    <Layout title="Dashboard">
      <div className="space-y-5 animate-fade-in-up" data-testid="pharmacy-dashboard">

        {/* Intestazione: chi sei, che giorno e', e il gesto che si fa di piu' */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Ciao {user?.name?.split(' ')[0] || ''}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
              {' · '}{stats?.deliveries?.today || 0} consegne oggi
            </p>
          </div>
          <Button className="btn-primary shrink-0" onClick={openNewDelivery} data-testid="nuova-consegna-home">
            <Plus className="mr-1.5 h-4 w-4" />Nuova consegna
          </Button>
        </div>

        {/* Email verification banner */}
        {user?.email_verified === false && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4" data-testid="verify-email-banner">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Verifica la tua email</p>
                <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                  Conferma <strong>{user?.email}</strong> per proteggere il tuo account. Controlla la posta o richiedi un nuovo link.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-500/40 text-amber-900 dark:text-amber-100 hover:bg-amber-500/20"
              onClick={resendVerification}
              disabled={resending}
              data-testid="resend-verification-btn"
            >
              {resending ? 'Invio…' : 'Reinvia email'}
            </Button>
          </div>
        )}

        {/* Indicatori della giornata */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((kpi, i) => (
            <Link
              key={kpi.label}
              to={kpi.to}
              className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Card className={`stat-modern card-interactive animate-slide-up stagger-${i}`}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                    {kpi.alert && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                  <p className="text-3xl font-black tracking-tight">{kpi.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
                  <div className={`mt-3 h-8 w-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Le cinque cose da guardare, prima di tutto il resto */}
        <DaGestireOra voci={vociDaGestire} totale={totaleDaGestire(vociDaGestire)} />

        {/* Consegne in corso e fattorini: il lavoro di adesso */}
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ConsegneInCorso
              consegne={consegne}
              statusLabels={statusLabels}
              formatCurrency={formatCurrency}
              onNuova={openNewDelivery}
            />
          </div>
          <RiepilogoFattorini fattorini={ensureArray(drivers)} consegne={consegne} />
        </div>

        {/* Cassa e mese: il numero che serve alla sera */}
        {cassaInHome && (
          <>
            <Card className="card-exclusive" data-testid="cassa-oggi">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">Cassa di oggi</p>
                  </div>
                  <Link to="/shifts" className="text-xs text-primary hover:underline">Turni e Cassa</Link>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Totale</p>
                    <p className="text-2xl font-black tabular-nums">€ {(stats?.today_money?.total || 0).toFixed(2).replace('.', ',')}</p>
                    <p className="text-xs text-muted-foreground">{stats?.today_money?.count || 0} consegne incassate</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Contanti</p>
                    <p className="text-lg font-bold tabular-nums">€ {(stats?.today_money?.cash || 0).toFixed(2).replace('.', ',')}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">POS</p>
                    <p className="text-lg font-bold tabular-nums">€ {(stats?.today_money?.pos || 0).toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <MeseInCorso mese={stats?.month} />
          </>
        )}

        {/* Andamento della settimana, in fondo: si guarda, non si gestisce */}
        <Card className="card-exclusive">
          <div className="flex items-center gap-2 px-4 pt-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Andamento settimana</h2>
          </div>
          <div className="px-2 pb-2">
            <div className="h-52 md:h-60">
              {hasWeeklyActivity ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
                  <TrendingUp className="mb-3 h-8 w-8 opacity-40" />
                  <p className="text-sm font-medium">Nessuna consegna completata questa settimana</p>
                  <p className="mt-1 text-xs">Il grafico apparira appena ci saranno consegne.</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Totali di sempre, in coda */}
        <div className="grid grid-cols-3 gap-3" data-testid="totali-storici">
          {[
            { label: 'Clienti', value: stats?.customers?.total || 0, icon: Users, to: '/customers' },
            { label: 'Annullate', value: stats?.deliveries?.cancelled || 0, icon: AlertCircle, to: '/archive' },
            { label: 'Tot. consegne', value: stats?.deliveries?.total || 0, icon: Package, to: '/archive' },
          ].map(({ label, value, icon: Icon, to }) => (
            <Link key={label} to={to} className="card-exclusive card-interactive block rounded-xl p-4 text-center">
              <Icon className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
              <p className="text-2xl font-black tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
