import React from 'react';
import { Link } from 'react-router-dom';
import { Package, MapPin, Plus, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

/* Le consegne che sono in giro adesso, con stato e importo.
   E' il blocco che la farmacia guarda di piu': sta subito sotto le cose da
   fare, prima di incassi e grafici. */

export default function ConsegneInCorso({
  consegne = [],
  statusLabels = {},
  formatCurrency = (valore) => valore,
  onNuova,
  limite = 6,
}) {
  const elenco = (consegne || []).slice(0, limite);

  return (
    <Card className="card-exclusive h-full" data-testid="consegne-in-corso">
      <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4 text-primary" />Consegne in corso
          {consegne.length > 0 && (
            <Badge variant="secondary" className="text-[11px]">{consegne.length}</Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" asChild className="h-7 text-xs text-primary">
          <Link to="/deliveries">Vedi tutte <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {elenco.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <Package className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p className="text-sm">Nessuna consegna in corso</p>
            <Button size="sm" className="btn-primary mt-3" onClick={onNuova}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Crea consegna
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {elenco.map((consegna) => (
              <Link
                key={consegna.delivery_id}
                to={`/deliveries?delivery=${consegna.delivery_id}`}
                className="flex items-center gap-3 rounded-xl bg-secondary/40 p-3 transition-colors hover:bg-secondary/70"
                data-testid={`in-corso-${consegna.delivery_id}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{consegna.customer_name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />{consegna.customer_address}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {consegna.amount ? (
                    <span className="text-sm font-bold text-primary">{formatCurrency(consegna.amount)}</span>
                  ) : null}
                  <Badge className={`status-${consegna.status} text-xs`}>
                    {statusLabels[consegna.status] || consegna.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
