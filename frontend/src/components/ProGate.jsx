import React from 'react';
import { Link } from 'react-router-dom';
import { Crown, Lock, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { usePlanQuery } from '@/hooks/queries';
import { dettaglioFunzione, funzioneSbloccata } from '@/lib/funzioniPro';

/* ProGate: il lucchetto delle funzioni Professional.

   Un solo posto decide se una funzione si apre o si spiega. Il backend manda
   in /plan l'elenco delle funzioni con "sbloccata", qui si disegna. Se il
   piano non è ancora arrivato la funzione resta aperta: meglio un istante di
   contenuto che un lucchetto sbagliato.
*/
export default function ProGate({ funzione, children, compatto = false }) {
  const { data: piano } = usePlanQuery();
  const aperta = funzioneSbloccata(piano, funzione);
  if (aperta) return <>{children}</>;

  const voce = dettaglioFunzione(piano, funzione);

  if (compatto) {
    return (
      <Card data-testid="pro-gate" className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-primary/5">
        <CardContent className="flex flex-col gap-2 p-4">
          <p className="flex items-center gap-2 font-medium">
            <Lock className="h-4 w-4 text-purple-400" />
            {voce.nome}
          </p>
          <p className="text-sm text-muted-foreground">{voce.descrizione}</p>
          <p className="text-xs text-muted-foreground">
            Compresa nel piano Professional. I dati già salvati restano.
          </p>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link to="/settings">Vedi i piani</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="pro-gate" className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-purple-400" />
          {voce.nome} è una funzione Professional
        </CardTitle>
        <CardDescription>{voce.descrizione}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          La prova mostra tutte le funzioni Professional. Quando finisce, questa si chiude
          e i dati già salvati restano dove sono: si smette di aggiungerne, non si cancella niente.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/settings">Vedi i piani</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/dashboard">Torna alla home</Link>
          </Button>
        </div>
        <div className="grid gap-2 pt-1 text-xs text-muted-foreground">
          {(piano?.funzioni || []).map((altra) => (
            <span key={altra.chiave} className="flex items-center gap-2">
              {altra.sbloccata ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-purple-400" />
              )}
              {altra.nome} · {altra.dove}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
