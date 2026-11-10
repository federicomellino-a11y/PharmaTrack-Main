import React from 'react';
import { BarChart3, Clock, Truck, XCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { ensureArray } from '@/lib/collections';
import { CardConTitolo, GIORNI_LUNGHI, TestataScheda, Vuoto, minuti } from './PezziReport';

/* Il giro, letto da tre lati: quanto ci mette, dove si inceppa e quando
   arrivano gli ordini. Sono le tre domande che una farmacia si fa davvero
   ("il fattorino basta?", "perché ieri non è arrivata?", "a che ora devo
   avere qualcuno in piedi?").
*/

export default function ConsegneReport({ dati, etichettaPeriodo }) {
  const tempi = dati?.delivery_times || {};
  const motivi = ensureArray(dati?.failures?.by_reason);
  const massimoMotivo = Math.max(1, ...motivi.map((voce) => voce.count || 0));
  const perOra = ensureArray(dati?.by_hour);
  const massimoOra = Math.max(1, ...perOra.map((voce) => voce.count || 0));
  const perGiorno = ensureArray(dati?.by_weekday);
  const massimoGiorno = Math.max(1, ...perGiorno.map((voce) => voce.count || 0));
  const punta = dati?.busiest || {};

  return (
    <section className="space-y-6" data-testid="scheda-consegne">
      <TestataScheda
        icona={Truck}
        titolo={`Il giro · ${etichettaPeriodo}`}
        descrizione="Quanto ci mette una consegna, perché a volte non arriva e a che ora entrano le richieste."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CardConTitolo icona={Clock} titolo="Quanto ci mette il giro" sotto="Dalla creazione dell'ordine alla consegna confermata">
          {tempi.sampled ? (
            <div className="space-y-4" data-testid="delivery-times">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Media</p>
                  <p className="text-3xl font-black tabular-nums">
                    {minuti(tempi.avg_minutes)}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">min</span>
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Metà delle volte</p>
                  <p className="text-3xl font-black tabular-nums">
                    {minuti(tempi.median_minutes)}
                    <span className="ml-1 text-sm font-medium text-muted-foreground">min</span>
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Contati su {tempi.sampled} {tempi.sampled === 1 ? 'consegna' : 'consegne'} completate. La metà delle volte
                la consegna arriva entro la mediana: è il numero da guardare, non la media.
              </p>
              {ensureArray(tempi.by_driver).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Il confronto per fattorino è nella scheda Squadra.
                </p>
              )}
            </div>
          ) : (
            <Vuoto titolo="Dati insufficienti" aiuto="Servono consegne completate con data di consegna." />
          )}
        </CardConTitolo>

        <CardConTitolo
          icona={XCircle}
          titolo="Perché non è arrivata"
          sotto={`${dati?.failures?.total || 0} consegne non riuscite nel periodo`}
        >
          {motivi.length === 0 ? (
            <Vuoto titolo="Nessuna consegna fallita" aiuto="Nel periodo scelto non ci sono consegne non riuscite." />
          ) : (
            <div className="space-y-3" data-testid="failure-reasons">
              {motivi.map((voce) => (
                <div key={voce.reason}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{voce.reason}</span>
                    <span className="shrink-0 tabular-nums font-medium">{voce.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-rose-500" style={{ width: `${Math.max(2, Math.round((voce.count / massimoMotivo) * 100))}%` }} />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Il motivo lo scrive il fattorino quando chiude la consegna: più è preciso, più serve a capire.
              </p>
            </div>
          )}
        </CardConTitolo>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Quando arrivano le richieste</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Ora in cui la farmacia crea l&apos;ordine: serve a decidere quando avere il fattorino in piedi.
          </p>

          <div className="flex h-28 items-end gap-1" data-testid="by-hour">
            {perOra.map((voce) => (
              <div key={voce.hour} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div
                  className="w-full rounded-t bg-primary/70 transition-colors hover:bg-primary"
                  style={{ height: `${Math.max(2, Math.round((voce.count / massimoOra) * 100))}%` }}
                  title={`${voce.hour}:00 · ${voce.count} richieste`}
                />
                {voce.hour % 3 === 0 && <span className="text-[10px] text-muted-foreground">{voce.hour}</span>}
              </div>
            ))}
          </div>

          {punta.hour != null && (
            <p className="mt-3 text-sm">
              Il momento più carico è <span className="font-semibold">alle {punta.hour}</span>
              {punta.weekday ? (
                <> e il giorno è <span className="font-semibold">{GIORNI_LUNGHI[punta.weekday] || punta.weekday}</span></>
              ) : null}.
            </p>
          )}

          {perGiorno.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Per giorno della settimana</p>
              <div className="flex items-end gap-2" data-testid="by-weekday">
                {perGiorno.map((voce) => (
                  <div key={voce.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] tabular-nums text-muted-foreground">{voce.count || 0}</span>
                    <div
                      className="w-full rounded-t bg-primary/40"
                      style={{ height: `${Math.max(3, Math.round(((voce.count || 0) / massimoGiorno) * 56))}px` }}
                      title={`${voce.day}: ${voce.count || 0} richieste`}
                    />
                    <span className="text-[10px] uppercase text-muted-foreground">{voce.day}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
