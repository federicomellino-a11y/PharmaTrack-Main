import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Clock, MapPin, Navigation, Phone } from 'lucide-react';
import { ETICHETTE_FATTORINO as statusLabels } from '@/lib/deliveryDisplay';

/* Una consegna, come la vede il fattorino per strada.

   Estratta dalla dashboard quando la lista e' diventata raggruppata per via:
   con due livelli di elenco il JSX non stava piu' in una schermata, e questo
   blocco era il pezzo che si ripeteva identico dentro ogni zona.
*/
export default function CartaConsegnaFattorino({ consegna, indice = 0 }) {
  const delivery = consegna;
  return (
    <Card
      className={`bg-zinc-900/50 border-zinc-800 hover:border-teal-500/30 transition-colors animate-slide-up stagger-${(indice % 3) + 1}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-white">{delivery.customer_name}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge className={`status-${delivery.status}`}>
                {statusLabels[delivery.status]}
              </Badge>
              {delivery.slot && (
                <Badge
                  variant="outline"
                  className={delivery.slot_late ? 'border-red-500/60 text-red-400' : 'border-zinc-700 text-zinc-300'}
                  data-testid={`slot-${delivery.delivery_id}`}
                >
                  <Clock className="w-3 h-3 mr-1" />
                  {delivery.slot_late ? 'in ritardo · ' : 'entro le '}
                  {delivery.slot}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2 text-zinc-400">
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{delivery.customer_address}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Phone className="w-4 h-4" />
            <a href={`tel:${delivery.customer_phone}`} className="hover:text-teal-400">
              {delivery.customer_phone}
            </a>
          </div>
          <p className="text-zinc-500 pl-6">
            <strong>Note:</strong> {delivery.notes || '-'}
          </p>
        </div>

        <div className="flex gap-2 mt-4">
          <Button
            asChild
            className="flex-1 bg-teal-500 hover:bg-teal-600 text-black"
            data-testid={`view-delivery-${delivery.delivery_id}`}
          >
            <Link to={`/driver/delivery/${delivery.delivery_id}`}>
              <Navigation className="w-4 h-4 mr-2" />
              Dettagli
            </Link>
          </Button>
          <Button
            variant="outline"
            className="border-zinc-700"
            asChild
          >
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.customer_address)}`} target="_blank" rel="noopener noreferrer">
              <MapPin className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
