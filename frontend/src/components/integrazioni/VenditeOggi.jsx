import React from 'react';
import { useWinfarmOggiQuery } from '@/hooks/queries';
import { ListChecks } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatCurrency } from '@/lib/format';
import { testoFascia } from '@/lib/fasce';
import { etichettaStato } from '@/lib/deliveryDisplay';

const ora = (iso) => (iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '');

/** Le vendite arrivate oggi da Consegna veloce, con stato e fascia. */
export default function VenditeOggi() {
  const { data: vendite = [] } = useWinfarmOggiQuery({ refetchInterval: 60000 });

  return (
    <Card data-testid="vendite-oggi">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="w-4 h-4 text-primary" />
          <p className="font-semibold text-sm">Vendite di oggi</p>
          <Badge variant="secondary" className="ml-auto" data-testid="vendite-oggi-numero">{vendite.length}</Badge>
        </div>
        {vendite.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="vendite-oggi-vuoto">Nessuna vendita arrivata oggi.</p>
        ) : (
          <ul className="divide-y">
            {vendite.map((v) => (
              <li key={v.delivery_id} className="flex items-center gap-3 py-2 text-sm" data-testid={`vendita-${v.delivery_id}`}>
                <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground">{ora(v.created_at)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{v.customer_name}</span>
                <span className="hidden sm:inline text-xs text-muted-foreground">{testoFascia(v.scheduled_time, v.slot_to) || 'prima possibile'}</span>
                <span className="tabular-nums">{v.amount != null ? formatCurrency(v.amount) : ''}</span>
                <Badge variant="outline" className="shrink-0">{etichettaStato(v.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
