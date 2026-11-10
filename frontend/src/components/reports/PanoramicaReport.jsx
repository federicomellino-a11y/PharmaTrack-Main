import React from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Euro, Package, TrendingUp, UserX } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { ensureArray } from '@/lib/collections';
import { formatCurrency } from '@/lib/format';
import { CardConTitolo, KpiCard, TestataScheda, Vuoto, shortDate } from './PezziReport';
import ConfrontoPeriodo from './ConfrontoPeriodo';

/* La scheda che si apre per prima: i quattro numeri, cosa chiede attenzione
   oggi e come sta andando il fatturato rispetto al periodo prima. Il resto
   (incassi, clienti, consegne, squadra) sta nelle altre schede, così qui non
   si scorre per due schermate prima di trovare quello che si cercava.
*/

const Avviso = ({ icona: Icona, valore, titolo, dettaglio, colore, to }) => (
  <Link
    to={to}
    className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-secondary/40"
  >
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${colore}1a` }}>
      <Icona className="h-4 w-4" style={{ color: colore }} />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-xl font-bold tabular-nums leading-tight" style={{ color: colore }}>{valore}</p>
      <p className="text-sm font-medium leading-tight">{titolo}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{dettaglio}</p>
    </div>
    <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
  </Link>
);

export default function PanoramicaReport({ dati, etichettaPeriodo }) {
  const s = dati?.summary || {};
  const delta = dati?.confronto?.delta || {};
  const daily = ensureArray(dati?.daily_revenue);
  const hasRevenue = daily.some((giorno) => (giorno.revenue || 0) > 0);
  const nonRiuscite = Number(dati?.failures?.total || 0);
  const inRitardo = Number(dati?.overdue_slots || 0);
  const senzaFattorino = Number(dati?.open_without_driver || 0);
  const nienteDaSegnalare = !nonRiuscite && !inRitardo && !senzaFattorino;

  return (
    <section className="space-y-6" data-testid="scheda-panoramica">
      <TestataScheda
        icona={TrendingUp}
        titolo={`Come sta andando la farmacia · ${etichettaPeriodo}`}
        descrizione="I numeri del periodo scelto, il confronto con quello prima e cosa richiede un occhio adesso."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard label="Fatturato" value={formatCurrency(s.total_revenue)} delta={delta.revenue_pct} sub="vs periodo prima" icon={Euro} tint="hsl(173,80%,40%)" />
        <KpiCard label="Consegne completate" value={s.delivered_count || 0} delta={delta.count_pct} sub={`su ${s.total_deliveries || 0} totali`} icon={Package} tint="hsl(199,89%,48%)" />
        <KpiCard label="Media ordine" value={formatCurrency(s.avg_order_value)} delta={delta.avg_order_pct} sub="per consegna" icon={TrendingUp} tint="hsl(45,93%,47%)" />
        <KpiCard label="Completamento" value={`${s.completion_rate || 0}%`} sub={`${s.cancelled || 0} annullate`} icon={CheckCircle2} tint="hsl(142,71%,45%)" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Cosa guardare adesso</h3>
          </div>
          {nienteDaSegnalare ? (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Niente da segnalare: nessuna consegna in ritardo, nessuna aperta senza fattorino, nessuna non riuscita nel periodo.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Avviso
                icona={Clock3}
                valore={inRitardo}
                titolo={inRitardo === 1 ? 'consegna in ritardo' : 'consegne in ritardo'}
                dettaglio="Fascia oraria passata, ordine ancora aperto"
                colore="hsl(0,72%,51%)"
                to="/deliveries"
              />
              <Avviso
                icona={UserX}
                valore={senzaFattorino}
                titolo={senzaFattorino === 1 ? 'consegna senza fattorino' : 'consegne senza fattorino'}
                dettaglio="Da preparare o pronte, nessuno assegnato"
                colore="hsl(38,92%,50%)"
                to="/deliveries"
              />
              <Avviso
                icona={AlertTriangle}
                valore={nonRiuscite}
                titolo={nonRiuscite === 1 ? 'consegna non riuscita' : 'consegne non riuscite'}
                dettaglio="Guarda il motivo nella scheda Consegne"
                colore="hsl(280,60%,55%)"
                to="/deliveries"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <CardConTitolo
          icona={TrendingUp}
          titolo="Andamento del fatturato"
          sotto="Ogni punto è un giorno con almeno una consegna completata"
          className="lg:col-span-2"
        >
          {!hasRevenue ? (
            <Vuoto titolo="Nessun fatturato nel periodo" aiuto="Il grafico si popola con le consegne completate." />
          ) : (
            <div className="h-64 w-full" data-testid="revenue-trend-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ left: 4, right: 12, top: 8 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(173,80%,40%)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(173,80%,40%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} width={52} tickFormatter={(v) => `€${Math.round(v)}`} />
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
        </CardConTitolo>

        <div className="lg:col-span-1">
          <ConfrontoPeriodo confronto={dati?.confronto} etichettaPeriodo={etichettaPeriodo} />
        </div>
      </div>
    </section>
  );
}
