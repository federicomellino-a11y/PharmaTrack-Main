import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { TrendingUp, TrendingDown, Minus, CalendarDays, Clock } from 'lucide-react';

/* Analisi di un singolo paziente.

   Riceve solo il blocco `analisi` che arriva da /customers/{id}/stats: i conti
   li fa il backend (app/core/analisi_cliente.py), qui si disegnano. Il grafico
   e' a barre e parte da zero: con gli importi e' l'unico modo per non far
   sembrare "dieci euro in piu'" un raddoppio.
*/

const euro = (valore) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(valore || 0);

const Segno = ({ valore }) => {
  if (valore === null || valore === undefined) {
    return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Minus className="h-3 w-3" />dato non disponibile</span>;
  }
  const su = valore >= 0;
  const Icona = su ? TrendingUp : TrendingDown;
  return (
    <span className={`text-xs font-medium inline-flex items-center gap-1 ${su ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icona className="h-3 w-3" />
      {su ? '+' : ''}{valore}%
    </span>
  );
};

const Barre = ({ serie }) => {
  const massimo = Math.max(...serie.map((m) => m.speso), 1);
  return (
    <div className="flex items-end gap-2 h-32" role="img"
      aria-label={`Spesa degli ultimi ${serie.length} mesi`}>
      {serie.map((mese) => {
        const altezza = Math.round((mese.speso / massimo) * 100);
        return (
          <div key={mese.mese} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-[10px] text-muted-foreground">{mese.speso ? euro(mese.speso) : ''}</span>
            <div className="w-full flex-1 flex items-end">
              <div
                className={`w-full rounded-t ${mese.speso ? 'bg-primary' : 'bg-muted'}`}
                style={{ height: `${mese.speso ? Math.max(altezza, 4) : 2}%` }}
                title={`${mese.etichetta}: ${mese.consegne} consegne, ${euro(mese.speso)}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{mese.etichetta}</span>
            <span className="text-[10px] font-medium">{mese.consegne || ''}</span>
          </div>
        );
      })}
    </div>
  );
};

export default function AnalisiCliente({ analisi }) {
  if (!analisi) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Analisi cliente</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sto raccogliendo lo storico di questo paziente.
        </CardContent>
      </Card>
    );
  }

  const confronto = analisi.confronto;
  const fascia = analisi.fascia_preferita;
  const giorno = analisi.giorno_preferito;

  return (
    <Card data-testid="analisi-cliente">
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-lg">Analisi cliente</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{analisi.ordini_conclusi} ordini conclusi</Badge>
          {confronto && (
            <Badge variant="outline">
              {confronto.sopra_la_media ? 'sopra' : 'sotto'} la media della farmacia
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Speso in totale</p>
            <p className="mt-1 text-xl font-semibold">{euro(analisi.speso_totale)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Spesa media</p>
            <p className="mt-1 text-xl font-semibold">{analisi.spesa_media ? euro(analisi.spesa_media) : '—'}</p>
            {confronto && (
              <p className="text-xs text-muted-foreground">
                farmacia {euro(confronto.media_farmacia)} ({confronto.differenza_percento > 0 ? '+' : ''}{confronto.differenza_percento}%)
              </p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ultimo mese</p>
            <p className="mt-1 text-xl font-semibold">
              {euro(analisi.serie_mensile[analisi.serie_mensile.length - 1]?.speso)}
            </p>
            <Segno valore={analisi.tendenza_mese_percento} />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Spesa mese per mese</p>
          <Barre serie={analisi.serie_mensile} />
          <p className="mt-2 text-xs text-muted-foreground">
            {analisi.mesi_con_ordini === 0
              ? 'Nessun ordine concluso negli ultimi sei mesi.'
              : `Ordini in ${analisi.mesi_con_ordini} mesi su ${analisi.serie_mensile.length}.`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <Clock className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Fascia preferita</p>
              <p className="text-sm font-medium">{fascia ? fascia.etichetta : 'Nessuna fascia ricorrente'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border p-3">
            <CalendarDays className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Giorno preferito</p>
              <p className="text-sm font-medium capitalize">{giorno ? giorno.giorno : 'Nessuna ricorrenza'}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
