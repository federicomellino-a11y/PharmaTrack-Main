import React from 'react';
import { MapPin } from 'lucide-react';
import CartaConsegnaFattorino from './CartaConsegnaFattorino';
import { raggruppaPerZona } from '@/lib/zoneConsegne';

/* Le consegne del giro, divise per via.

   Sta a parte dalla dashboard per due motivi: la pagina resta leggibile, e il
   raggruppamento si puo' provare senza fingere sessione, turno e posizione.
   Con una sola via (o una sola consegna) l'intestazione sarebbe rumore: si
   mostra solo quando c'e' piu' di un gruppo.
*/
export default function ListaConsegneFattorino({ consegne = [] }) {
  const zone = raggruppaPerZona(consegne);
  const mostraZone = zone.length > 1;
  return (
    <div className="space-y-3" data-testid="lista-consegne-fattorino">
      {zone.map((gruppo) => (
        <React.Fragment key={gruppo.chiave}>
          {mostraZone && (
            <div className="flex items-center gap-2 pt-2" data-testid={`zona-${gruppo.chiave}`}>
              <MapPin className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-semibold text-teal-300">{gruppo.titolo}</h3>
              <span className="text-xs text-zinc-500">{gruppo.consegne.length}</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
          )}
          {gruppo.consegne.map((consegna, indice) => (
            <CartaConsegnaFattorino
              key={consegna.delivery_id}
              consegna={consegna}
              indice={indice}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}
