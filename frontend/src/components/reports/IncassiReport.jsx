import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Banknote, CalendarDays, CreditCard, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { ensureArray } from '@/lib/collections';
import { formatCurrency } from '@/lib/format';
import { CardConTitolo, KpiCard, RigaBarra, TestataScheda, Vuoto, quota, shortDate } from './PezziReport';

/* Come sono entrati i soldi.

   Contanti e POS non sono un dettaglio contabile: la farmacia deve sapere
   quanto contante tiene il fattorino addosso a fine giro. Qui il mix si vede
   in euro, in consegne e in quota, con il ticket medio di ogni metodo, più
   il ritmo del periodo (il giorno migliore e la media al giorno).
*/

const METODI = {
  cash: { nome: 'Contanti', colore: 'hsl(142,76%,36%)', icona: Banknote },
  pos: { nome: 'POS', colore: 'hsl(199,89%,48%)', icona: CreditCard },
};

const aspetto = (chiave) =>
  METODI[chiave] || { nome: chiave === 'card' ? 'Carta' : chiave, colore: 'hsl(280,60%,55%)', icona: CreditCard };

export default function IncassiReport({ dati, etichettaPeriodo }) {
  const s = dati?.summary || {};
  const split = dati?.payment_split || {};
  const metodi = Object.entries(split)
    .map(([chiave, voce]) => ({
      chiave,
      ...aspetto(chiave),
      revenue: Number(voce?.revenue || 0),
      count: Number(voce?.count || 0),
    }))
    .filter((voce) => voce.revenue > 0 || voce.count > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const totale = metodi.reduce((somma, voce) => somma + voce.revenue, 0);
  const consegne = metodi.reduce((somma, voce) => somma + voce.count, 0);
  const contanti = metodi.find((voce) => voce.chiave === 'cash')?.revenue || 0;
  const pos = metodi.reduce((somma, voce) => somma + voce.revenue, 0) - contanti;
  const ticketMedio = consegne ? totale / consegne : 0;

  const giornate = ensureArray(dati?.daily_revenue).filter((giorno) => (giorno.revenue || 0) > 0);
  const migliore = giornate.reduce(
    (trovato, giorno) => ((giorno.revenue || 0) > (trovato?.revenue || 0) ? giorno : trovato),
    null,
  );
  const mediaGiorno = giornate.length ? totale / giornate.length : 0;

  return (
    <section className="space-y-6" data-testid="scheda-incassi">
      <TestataScheda
        icona={Wallet}
        titolo={`Come sono entrati i soldi · ${etichettaPeriodo}`}
        descrizione="Contanti e POS delle consegne completate: quanto, quante volte e con che ticket."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard label="Incassato" value={formatCurrency(totale)} sub={`su ${consegne} consegne`} icon={Wallet} tint="hsl(173,80%,40%)" />
        <KpiCard label="Contanti" value={formatCurrency(contanti)} sub={`${quota(contanti, totale)}% del totale`} icon={Banknote} tint="hsl(142,76%,36%)" />
        <KpiCard label="POS" value={formatCurrency(pos)} sub={`${quota(pos, totale)}% del totale`} icon={CreditCard} tint="hsl(199,89%,48%)" />
        <KpiCard label="Ticket medio" value={formatCurrency(ticketMedio)} sub="per consegna incassata" icon={Receipt} tint="hsl(45,93%,47%)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CardConTitolo icona={CreditCard} titolo="Il mix del periodo" sotto="Quota di fatturato per metodo di pagamento">
          {totale === 0 ? (
            <Vuoto titolo="Ancora nessun incasso" aiuto="Qui vedrai la divisione tra contanti e POS." />
          ) : (
            <div className="h-64 w-full" data-testid="payment-split-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metodi}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={84}
                    paddingAngle={4}
                    dataKey="revenue"
                    stroke="none"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {metodi.map((voce) => <Cell key={voce.chiave} fill={voce.colore} />)}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, item) => [
                      formatCurrency(value),
                      `${item.payload.nome} (${item.payload.count} consegne)`,
                    ]}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardConTitolo>

        <CardConTitolo icona={Receipt} titolo="Dettaglio per metodo" sotto="Importo, consegne e ticket medio di ognuno">
          {metodi.length === 0 ? (
            <Vuoto titolo="Niente da dividere" aiuto="Servono consegne completate nel periodo." />
          ) : (
            <div className="space-y-4" data-testid="payment-detail">
              {metodi.map((voce) => {
                const Icona = voce.icona;
                return (
                  <div key={voce.chiave}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <Icona className="h-4 w-4" style={{ color: voce.colore }} />
                      <span className="font-medium">{voce.nome}</span>
                      <span className="ml-auto tabular-nums font-semibold">{formatCurrency(voce.revenue)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(2, quota(voce.revenue, totale))}%`, backgroundColor: voce.colore }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {voce.count} {voce.count === 1 ? 'consegna' : 'consegne'} · ticket medio{' '}
                      {formatCurrency(voce.count ? voce.revenue / voce.count : 0)}
                    </p>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Il contante è quello che il fattorino deve avere addosso a fine giro: {formatCurrency(contanti)}.
              </p>
            </div>
          )}
        </CardConTitolo>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Il ritmo del periodo</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Giorno migliore</p>
              <p className="text-lg font-bold tabular-nums">
                {migliore ? formatCurrency(migliore.revenue) : formatCurrency(0)}
              </p>
              <p className="text-[11px] text-muted-foreground">{migliore ? shortDate(migliore.date) : 'nessun incasso'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Media al giorno</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(mediaGiorno)}</p>
              <p className="text-[11px] text-muted-foreground">sui giorni con incassi</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Giorni con incassi</p>
              <p className="text-lg font-bold tabular-nums">{giornate.length}</p>
              <p className="text-[11px] text-muted-foreground">su {dati?.days || 0} giorni di periodo</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Fatturato delle consegne completate: {formatCurrency(s.total_revenue)} in {etichettaPeriodo.toLowerCase()}.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
