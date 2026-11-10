import { Card } from '../ui/card';
import { CardContent } from '../ui/card';
import { CardDescription } from '../ui/card';
import { CardHeader } from '../ui/card';
import { CardTitle } from '../ui/card';
import { Crown } from 'lucide-react';
import { Lock } from 'lucide-react';
import { Check } from 'lucide-react';
import { Clock } from 'lucide-react';
import { FUNZIONI_PRO } from '@/lib/funzioniPro';

/* FunzioniProCard: cosa è compreso nel piano Professional.

   Fino al 10/11 questa scheda prometteva cinque funzioni "in arrivo" che non
   esistevano. Ora dice la verità: tre funzioni ci sono, sono quelle vere, e
   qui si vede se sul tuo account sono aperte o chiuse. La verità arriva da
   /plan (backend/app/core/funzioni_pro.py), non da una lista scritta a mano.
*/
export default function FunzioniProCard({ piano }) {
  const elenco = piano?.funzioni?.length ? piano.funzioni : FUNZIONI_PRO;
  // Multisede non esiste ancora: sta nell'elenco come cosa da fare, non come
  // lucchetto. Se contasse fra le chiuse, la scheda direbbe una bugia al contrario.
  const nessunaChiusa = elenco.filter((funzione) => !funzione.in_arrivo).every((funzione) => funzione.sbloccata);

  return (
    <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-primary/5" data-testid="funzioni-pro">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Crown className="w-5 h-5 text-purple-400" />Funzioni PRO</CardTitle>
        <CardDescription>
          {nessunaChiusa
            ? 'Comprese nel tuo piano, tutte attive'
            : 'Comprese nel piano Professional: la prova le apre tutte'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {elenco.map((funzione) => (
            <div key={funzione.chiave} className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
              <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center">
                {funzione.in_arrivo
                  ? <Clock className="w-4 h-4 text-muted-foreground" />
                  : funzione.sbloccata
                    ? <Check className="w-4 h-4 text-emerald-500" />
                    : <Lock className="w-4 h-4 text-purple-400" />}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {funzione.nome}
                  {funzione.in_arrivo && <span className="ml-2 text-[11px] font-normal text-muted-foreground">in arrivo</span>}
                </p>
                <p className="text-xs text-muted-foreground">{funzione.descrizione}</p>
                {funzione.dove && <p className="text-[11px] text-muted-foreground/80 mt-0.5">Dove: {funzione.dove}</p>}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-center text-muted-foreground mt-4">
          {nessunaChiusa
            ? 'Quello che non è qui (consegne, clienti, anagrafica, chat, archivio) resta nel piano base.'
            : 'Passando a un piano a pagamento si riaprono; i dati già salvati restano.'}
        </p>
      </CardContent>
    </Card>
  );
}
