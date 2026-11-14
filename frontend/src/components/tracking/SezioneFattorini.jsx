/* Una sezione della colonna laterale del Tracking: un blocco per ogni stato di
   presenza del fattorino.

   Prima c'era una sola lista "Fattorini online" che mescolava chi trasmetteva la
   posizione adesso con chi aveva solo due coordinate vecchie: la pagina non
   poteva dire la differenza perche' non la calcolava. La regola sta in
   lib/trackingPresenze, qui c'e' solo il disegno.
*/
import { Truck } from 'lucide-react';
import { STATI_PRESENZA, testoUltimoAggiornamento } from '@/lib/trackingPresenze';

export const STILE_PRESENZA = {
  live: {
    pallino: 'bg-emerald-500',
    testo: 'text-emerald-700 dark:text-emerald-300',
    bordo: 'border-emerald-500/50',
    sfondo: 'bg-emerald-500/10',
  },
  in_ritardo: {
    pallino: 'bg-amber-500',
    testo: 'text-amber-700 dark:text-amber-300',
    bordo: 'border-amber-500/50',
    sfondo: 'bg-amber-500/10',
  },
  non_disponibile: {
    pallino: 'bg-muted-foreground',
    testo: 'text-muted-foreground',
    bordo: 'border-border',
    sfondo: 'bg-secondary',
  },
};

const VUOTO = {
  live: 'Nessuna posizione aggiornata negli ultimi minuti.',
  in_ritardo: "Nessuna posizione ferma da piu' di un quarto d'ora.",
  non_disponibile: 'Nessun fattorino spento o senza posizione.',
};

export default function SezioneFattorini({
  stato,
  fattorini = [],
  consegneAttive = [],
  selezionato = null,
  onCentra,
  adesso = Date.now(),
}) {
  const meta = STATI_PRESENZA[stato];
  const stile = STILE_PRESENZA[stato];

  return (
    <div data-testid={`sezione-${meta.testid}`}>
      <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${stile.pallino}`} />
        {meta.etichetta} ({fattorini.length})
      </h3>
      {fattorini.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">{VUOTO[stato]}</p>
      ) : (
        <div className="space-y-2">
          {fattorini.map((driver) => {
            const quante = consegneAttive.filter((delivery) => delivery.driver_id === driver.driver_id).length;
            const attivo = selezionato?.driver_id === driver.driver_id;
            return (
              <button
                key={driver.driver_id}
                type="button"
                onClick={() => onCentra?.(driver)}
                className={`w-full p-3 rounded-lg text-left transition-colors ${
                  attivo ? `${stile.sfondo} border ${stile.bordo}` : 'border border-transparent hover:bg-secondary'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-8 h-8 rounded-full ${stile.sfondo} flex items-center justify-center`}>
                    <Truck className={`w-4 h-4 ${stile.testo}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">{driver.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{driver.vehicle_type || 'Mezzo non indicato'}</p>
                    <p className={`text-[11px] ${stile.testo}`}>{testoUltimoAggiornamento(driver, adesso)}</p>
                  </div>
                </div>
                {quante > 0 && (
                  <div className="mt-2 pl-10">
                    <p className="text-xs text-primary">
                      {quante} consegn{quante === 1 ? 'a' : 'e'} attiv{quante === 1 ? 'a' : 'e'}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
