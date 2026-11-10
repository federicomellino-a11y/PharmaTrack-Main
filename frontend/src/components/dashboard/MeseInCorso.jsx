import React from 'react';
import { Card, CardContent } from '../ui/card';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

/* "Questo mese", in un numero solo.

   Il titolare non ricostruisce il mese dai report: ripete una frase al
   telefono con il collega ("312 consegne, 4.210 euro, 14 minuti di media").
   I dati c'erano gia' in report e turni, sparsi. Questo riquadro e' quella
   frase, in cima alla home, con il numero delle consegne come cifra grande
   perche' e' quello che si ricorda.

   Riceve solo l'oggetto `mese` di /statistics: nessuna chiamata propria, cosi'
   la home continua a fare un giro solo.
*/
export default function MeseInCorso({ mese }) {
  const consegne = Number(mese?.deliveries) || 0;
  if (!consegne) {
    return (
      <Card data-testid="mese-in-corso" data-vuoto="true">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Questo mese</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Ancora nessuna consegna incassata da inizio mese.
          </p>
        </CardContent>
      </Card>
    );
  }

  const minuti = mese?.avg_minutes;
  return (
    <Card className="card-exclusive" data-testid="mese-in-corso">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">Questo mese</p>
          <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
            dall&apos;1
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-4xl font-black tracking-tight tabular-nums" data-testid="mese-consegne">
              {consegne}
            </p>
            <p className="text-xs text-muted-foreground">
              {consegne === 1 ? 'consegna incassata' : 'consegne incassate'}
            </p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums" data-testid="mese-incassato">
              {formatCurrency(mese?.revenue)}
            </p>
            <p className="text-xs text-muted-foreground">incassati</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums" data-testid="mese-tempo">
              {minuti ? `${minuti} min` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">tempo medio</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
