import { Package, Plus } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import DeliveryRow from './DeliveryRow';
import { consegnaInRitardo } from '@/lib/deliveryDisplay';

/**
 * L'elenco delle consegne con il suo stato vuoto. Il filtro, l'ordinamento e le
 * azioni restano nella pagina: qui si mostra quello che arriva.
 */
export default function ListaConsegne({
  consegne = [],
  nessuna = false,
  cerca = '',
  scheda = 'active',
  listIsCapped = false,
  fattorini = [],
  gestori = {},
  onNuova,
}) {
  return (
    <>
      {nessuna ? (
    <Card>
      <CardContent className="py-16 text-center">
        <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
        <p className="font-medium text-muted-foreground">
          {listIsCapped && (
          <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            Stai vedendo le 500 consegne più recenti: usa la ricerca o l'archivio per le altre.
          </p>
        )}
        {cerca ? 'Nessuna consegna trovata' : scheda === 'active' ? 'Nessuna consegna attiva' : 'Archivio vuoto'}
        </p>
        {!cerca && scheda === 'active' && (
          <Button className="btn-primary mt-4" size="sm" onClick={onNuova}>
            <Plus className="w-4 h-4 mr-1.5" />Crea la prima consegna
          </Button>
        )}
      </CardContent>
    </Card>
  ) : (
    <div className="space-y-2.5">
{consegne.map((d) => (
        <DeliveryRow
          key={d.delivery_id}
          d={d}
          drivers={fattorini}
          inRitardo={consegnaInRitardo}
          handlers={gestori}
        />
      ))}
    </div>
  )}
    </>
  );
}
