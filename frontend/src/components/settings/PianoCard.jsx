import { Card } from '../ui/card';
import { CardContent } from '../ui/card';
import { CardDescription } from '../ui/card';
import { CardHeader } from '../ui/card';
import { CardTitle } from '../ui/card';
import { CreditCard } from 'lucide-react';

/* PianoCard: piano, limiti d'uso e scadenza della prova.

   Estratto da Settings.jsx: la pagina teneva dieci schede in fila e nessuna
   si poteva leggere da sola. Riceve dallo stato della pagina solo cio' che usa.
*/
export default function PianoCard({ limiti, piano, provaFinita, uso, vicinoAlTetto }) {
  return (
        <Card className={provaFinita ? 'border-destructive/40' : ''} data-testid="carta-del-piano">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />Piano
            </CardTitle>
            <CardDescription>
              {piano?.nome
                ? `${piano.nome}${piano.prezzo_mese ? ` · ${piano.prezzo_mese} €/mese` : ''}`
                : 'Nessun limite attivo su questo account'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {piano?.in_prova && !provaFinita && (
              <p className="text-sm">
                Prova in corso, restano <span className="font-semibold">{Math.max(0, piano.giorni_rimasti ?? 0)} giorni</span>.
              </p>
            )}
            {provaFinita && (
              <p className="text-sm font-medium text-destructive">
                Prova finita: non puoi creare nuove consegne.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">Consegne questo mese</p>
                <p className="font-bold tabular-nums">
                  {uso.consegne_mese ?? 0}
                  {limiti.max_consegne_mese ? ` / ${limiti.max_consegne_mese}` : ''}
                </p>
              </div>
              <div className="rounded-xl bg-secondary/40 p-3">
                <p className="text-xs text-muted-foreground">Fattorini attivi</p>
                <p className="font-bold tabular-nums">
                  {uso.fattorini ?? 0}
                  {limiti.max_fattorini ? ` / ${limiti.max_fattorini}` : ''}
                </p>
              </div>
            </div>
            {vicinoAlTetto && !provaFinita && (
              <p className="text-xs text-amber-600">
                Sei vicino al limite del piano.
              </p>
            )}
            {piano?.catalogo?.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {piano.catalogo.filter((voce) => voce.piano !== 'prova').map((voce) => (
                  <div key={voce.piano} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-medium">{voce.nome}</span>
                    <span className="text-muted-foreground">
                      {voce.prezzo_mese} €/mese · {voce.max_fattorini} fattorini · {voce.max_consegne_mese} consegne
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>


  );
}
