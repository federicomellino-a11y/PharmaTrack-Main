import React from 'react';
import { Card, CardContent } from '../ui/card';
import { ArrowDownRight, ArrowUpRight, Minus, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { ensureArray } from '@/lib/collections';

/* Il confronto col periodo prima, e chi c'è dietro ai soldi.

   Perché: "hai fatturato 840 €" non dice se va bene. Lo stesso numero con
   accanto il mese prima dice se la farmacia sta crescendo o perdendo, che è
   la ragione per cui si aprono i report. Le percentuali arrivano dal backend
   (analytics.confronto) e restano vuote quando prima non c'era niente da
   confrontare: uno zero inventato spaventerebbe senza motivo.
*/

const Delta = ({ etichetta, percentuale, valore }) => {
  if (percentuale === null || percentuale === undefined) {
    return (
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{etichetta}</p>
        <p className="text-sm font-semibold flex items-center gap-1 text-muted-foreground">
          <Minus className="w-3.5 h-3.5 shrink-0" />niente da confrontare
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{valore}</p>
      </div>
    );
  }
  const su = percentuale > 0;
  const giu = percentuale < 0;
  const Icona = su ? ArrowUpRight : giu ? ArrowDownRight : Minus;
  const colore = su ? 'text-emerald-600' : giu ? 'text-rose-600' : 'text-muted-foreground';
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground truncate">{etichetta}</p>
      <p className={`text-sm font-semibold flex items-center gap-1 tabular-nums ${colore}`}>
        <Icona className="w-3.5 h-3.5 shrink-0" />
        {percentuale > 0 ? '+' : ''}{percentuale.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%
      </p>
      <p className="text-[11px] text-muted-foreground truncate">{valore}</p>
    </div>
  );
};

export default function ConfrontoPeriodo({ confronto, clienti, etichettaPeriodo }) {
  const precedente = confronto?.previous || {};
  const delta = confronto?.delta || {};
  const primaEtichetta = etichettaPeriodo ? `${etichettaPeriodo} prima` : 'Periodo prima';
  const datiClienti = clienti || {};
  const totale = Number(datiClienti.totali || 0);
  const nuovi = Number(datiClienti.nuovi || 0);
  const ritorno = Number(datiClienti.di_ritorno || 0);
  const quotaNuovi = totale ? Math.round((nuovi / totale) * 100) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="confronto-periodo">
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Confronto con il {primaEtichetta.toLowerCase()}</p>
          <div className="grid grid-cols-3 gap-3">
            <Delta
              etichetta="Fatturato"
              percentuale={delta.revenue_pct}
              valore={`era ${formatCurrency(precedente.total_revenue || 0)}`}
            />
            <Delta
              etichetta="Consegne"
              percentuale={delta.count_pct}
              valore={`erano ${precedente.delivered_count || 0}`}
            />
            <Delta
              etichetta="Media ordine"
              percentuale={delta.avg_order_pct}
              valore={`era ${formatCurrency(precedente.avg_order_value || 0)}`}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Stessa lunghezza di periodo, subito prima di questo. Le percentuali restano vuote
            quando prima non c&apos;era nulla da confrontare.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />Chi ha ordinato
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Pazienti</p>
              <p className="text-lg font-bold tabular-nums">{totale}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Nuovi</p>
              <p className="text-lg font-bold tabular-nums text-emerald-600">{nuovi}</p>
              <p className="text-[11px] text-muted-foreground">{quotaNuovi}% del totale</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">Di ritorno</p>
              <p className="text-lg font-bold tabular-nums">{ritorno}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Spesa media per paziente nel periodo: {formatCurrency(datiClienti.spesa_media || 0)}.
            Nuovo vuol dire che la sua prima consegna è di questo periodo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
