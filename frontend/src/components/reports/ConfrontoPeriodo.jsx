import React from 'react';
import { Card, CardContent } from '../ui/card';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

/* Il confronto col periodo prima.

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
        <p className="truncate text-xs text-muted-foreground">{etichetta}</p>
        <p className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          <Minus className="h-3.5 w-3.5 shrink-0" />niente da confrontare
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{valore}</p>
      </div>
    );
  }
  const su = percentuale > 0;
  const giu = percentuale < 0;
  const Icona = su ? ArrowUpRight : giu ? ArrowDownRight : Minus;
  const colore = su ? 'text-emerald-600' : giu ? 'text-rose-600' : 'text-muted-foreground';
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{etichetta}</p>
      <p className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${colore}`}>
        <Icona className="h-3.5 w-3.5 shrink-0" />
        {percentuale > 0 ? '+' : ''}{percentuale.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{valore}</p>
    </div>
  );
};

export default function ConfrontoPeriodo({ confronto, etichettaPeriodo }) {
  const precedente = confronto?.previous || {};
  const delta = confronto?.delta || {};
  const primaEtichetta = etichettaPeriodo ? `${etichettaPeriodo} prima` : 'Periodo prima';

  return (
    <Card className="h-full" data-testid="confronto-periodo">
      <CardContent className="flex h-full flex-col p-4">
        <p className="mb-3 text-sm font-semibold">Confronto con il {primaEtichetta.toLowerCase()}</p>
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
        <p className="mt-auto pt-3 text-[11px] text-muted-foreground">
          Stessa lunghezza di periodo, subito prima di questo. La percentuale resta vuota
          quando prima non c&apos;era nulla da confrontare.
        </p>
      </CardContent>
    </Card>
  );
}
