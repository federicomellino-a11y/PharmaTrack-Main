import React from 'react';
import { Medal, Timer, Truck } from 'lucide-react';
import { ensureArray } from '@/lib/collections';
import { formatCurrency } from '@/lib/format';
import { CardConTitolo, TestataScheda, Vuoto, minuti, quota } from './PezziReport';

/* La squadra: chi consegna di più e chi consegna più in fretta.

   Sono due classifiche diverse e vanno tenute separate: chi fa più consegne
   non è per forza il più veloce, e viceversa. Metterle nella stessa card
   faceva leggere la velocità come un merito del volume.
*/

export default function SquadraReport({ dati, etichettaPeriodo }) {
  const fattorini = ensureArray(dati?.driver_performance);
  const tempi = ensureArray(dati?.delivery_times?.by_driver);
  const totaleConsegne = fattorini.reduce((somma, voce) => somma + Number(voce.deliveries || 0), 0);
  const piuLento = Math.max(1, ...tempi.map((voce) => Number(voce.avg_minutes || 0)));

  return (
    <section className="space-y-6" data-testid="scheda-squadra">
      <TestataScheda
        icona={Truck}
        titolo={`La squadra · ${etichettaPeriodo}`}
        descrizione="Chi ha consegnato di più, chi ha gestito più fatturato e chi ci mette meno tempo."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CardConTitolo icona={Medal} titolo="Chi consegna di più" sotto={`${totaleConsegne} consegne completate nel periodo`}>
          {fattorini.length === 0 ? (
            <Vuoto titolo="Nessun fattorino in classifica" aiuto="Le performance compaiono con le consegne completate." />
          ) : (
            <div className="space-y-3" data-testid="driver-ranking">
              {fattorini.map((fattorino, indice) => (
                <div key={fattorino.driver_id} className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    indice === 0 ? 'bg-amber-500/20 text-amber-600'
                      : indice === 1 ? 'bg-zinc-400/20 text-zinc-500'
                        : indice === 2 ? 'bg-orange-600/20 text-orange-600'
                          : 'bg-primary/10 text-primary'}`}>
                    {indice + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{fattorino.name}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">{fattorino.deliveries}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, quota(fattorino.deliveries, totaleConsegne))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCurrency(fattorino.revenue)} gestiti · {quota(fattorino.deliveries, totaleConsegne)}% delle consegne
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardConTitolo>

        <CardConTitolo icona={Timer} titolo="Chi consegna più in fretta" sotto="Media dei minuti per consegna, dal più veloce">
          {tempi.length === 0 ? (
            <Vuoto titolo="Tempi non ancora misurabili" aiuto="Servono consegne chiuse con l'ora di consegna registrata." />
          ) : (
            <div className="space-y-3" data-testid="driver-times">
              {tempi.map((voce) => (
                <div key={voce.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{voce.name}</span>
                    <span className="shrink-0 tabular-nums font-semibold">
                      {minuti(voce.avg_minutes)} min
                      <span className="ml-1 text-xs font-normal text-muted-foreground">({voce.count})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.max(4, Math.round((Number(voce.avg_minutes || 0) / piuLento) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Il numero tra parentesi è quante consegne sono state misurate: con poche consegne la media balla.
              </p>
            </div>
          )}
        </CardConTitolo>
      </div>
    </section>
  );
}
