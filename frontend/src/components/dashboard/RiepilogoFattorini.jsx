import React from 'react';
import { Link } from 'react-router-dom';
import { Truck, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { statoPresenza, STATI_PRESENZA, testoUltimoAggiornamento } from '@/lib/trackingPresenze';

/* Riepilogo fattorini: chi c'e', dove sta mandando la posizione e quante
   consegne ha in mano. Non e' la pagina Tracking: qui si guarda e si capisce
   in due secondi, il resto si apre da li'. */

const COLORI = {
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  zinc: 'bg-secondary text-muted-foreground border-border',
};

const IN_CORSO = ['assigned', 'picked_up', 'in_transit'];

export default function RiepilogoFattorini({ fattorini = [], consegne = [], adesso = Date.now() }) {
  const attivi = (fattorini || []).filter((fattorino) => fattorino?.is_active);
  const inCorsoPerFattorino = (driverId) => (consegne || [])
    .filter((consegna) => consegna?.driver_id === driverId && IN_CORSO.includes(consegna?.status)).length;

  return (
    <Card className="card-exclusive" data-testid="riepilogo-fattorini">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Truck className="h-4 w-4 text-primary" />
          Fattorini
        </CardTitle>
        <ButtonLink />
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {attivi.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Nessun fattorino attivo
          </p>
        ) : (
          <div className="space-y-1">
            {attivi.map((fattorino) => {
              const presenza = statoPresenza(fattorino, adesso);
              const stato = STATI_PRESENZA[presenza.stato] || STATI_PRESENZA.non_disponibile;
              const inCorso = inCorsoPerFattorino(fattorino.driver_id);
              return (
                <div
                  key={fattorino.driver_id}
                  className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-secondary/50"
                  data-testid={`fattorino-${fattorino.driver_id}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                    {(fattorino.name || 'F').charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{fattorino.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {testoUltimoAggiornamento(fattorino, adesso)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${COLORI[stato.colore] || COLORI.zinc}`}>
                      {stato.etichetta}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {inCorso > 0 ? `${inCorso} in corso` : 'nessuna in corso'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const ButtonLink = () => (
  <Link to="/drivers" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
    Anagrafica <ArrowRight className="h-3 w-3" />
  </Link>
);
