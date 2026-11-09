import { Card } from '../ui/card';
import { CardContent } from '../ui/card';
import { CardDescription } from '../ui/card';
import { CardHeader } from '../ui/card';
import { CardTitle } from '../ui/card';
import { Crown } from 'lucide-react';
import { Lock } from 'lucide-react';

/* FunzioniProCard: la scheda delle funzioni in arrivo.

   Estratto da Settings.jsx: la pagina teneva dieci schede in fila e nessuna
   si poteva leggere da sola. Riceve dallo stato della pagina solo cio' che usa.
*/
export default function FunzioniProCard() {
  return (
        <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Crown className="w-5 h-5 text-purple-400" />Funzioni PRO</CardTitle>
            <CardDescription>Funzionalità avanzate in arrivo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {[
                { title: 'Assegnazione automatica', desc: 'Assegna al fattorino più vicino' },
                { title: 'Ottimizzazione percorsi', desc: 'Calcola il percorso più efficiente' },
                { title: 'Report avanzati', desc: 'Analisi dettagliate con export' },
                { title: 'Multi-farmacia', desc: 'Gestisci più sedi' },
                { title: 'API esterne', desc: 'Integra con altri software' },
              ].map((feature) => (
                <div key={feature.title} className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
                  <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center"><Lock className="w-4 h-4 text-purple-400" /></div>
                  <div>
                    <p className="font-medium text-sm">{feature.title}</p>
                    <p className="text-xs text-muted-foreground">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">Queste funzioni saranno disponibili presto!</p>
          </CardContent>
        </Card>

  );
}
