import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Users } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { quota } from './PezziReport';

/* Chi c'è dietro ai soldi del periodo.

   Tre numeri che si leggono in un colpo: quanti pazienti hanno ordinato,
   quanti sono nuovi (prima consegna di sempre dentro il periodo) e quanti
   sono di ritorno. La spesa media per paziente chiude il conto.
*/

export default function NumeriClienti({ clienti }) {
  const dati = clienti || {};
  const totale = Number(dati.totali || 0);
  const nuovi = Number(dati.nuovi || 0);
  const ritorno = Number(dati.di_ritorno || 0);
  const percentualeNuovi = quota(nuovi, totale);

  return (
    <Card data-testid="numeri-clienti">
      <CardContent className="p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" />Chi ha ordinato
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">Pazienti</p>
            <p className="text-2xl font-bold tabular-nums">{totale}</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">Nuovi</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-600">{nuovi}</p>
            <p className="text-[11px] text-muted-foreground">{percentualeNuovi}% del totale</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">Di ritorno</p>
            <p className="text-2xl font-bold tabular-nums">{ritorno}</p>
          </div>
        </div>
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-emerald-500" style={{ width: `${percentualeNuovi}%` }} />
          <div className="h-full bg-primary/60" style={{ width: `${100 - percentualeNuovi}%` }} />
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Spesa media per paziente nel periodo: {formatCurrency(dati.spesa_media || 0)}.
          Nuovo vuol dire che la sua prima consegna è di questo periodo.
        </p>
      </CardContent>
    </Card>
  );
}
