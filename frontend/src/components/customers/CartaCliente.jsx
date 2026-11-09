import { Link } from 'react-router-dom';
import { ChevronRight, CreditCard, MapPin, Package, Pencil, Phone, Trash2, User } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ensureArray } from '@/lib/collections';

/**
 * Una scheda dell'elenco clienti. Riceve il cliente e i quattro gesti; i due
 * link (mappa e nuova consegna) arrivano gia' fatti dalla pagina.
 */
export default function CartaCliente({ customer, indice = 0, onApri, onModifica, onElimina, linkMappa, linkConsegna }) {
  const hasVerifiedAddress = customer.customer_lat != null && customer.customer_lng != null;
  const extraPhones = ensureArray(customer.extra_phones);

  return (
      <Card
        key={customer.customer_id}
        className={`cursor-pointer border-border/80 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm animate-slide-up stagger-${(indice % 5) + 1}`}
        onClick={() => onApri(customer)}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{customer.name}</h3>
                <p className="text-xs text-muted-foreground">{customer.email || 'Email non inserita'}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => { event.stopPropagation(); onModifica(customer); }}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                data-testid={`edit-customer-${customer.customer_id}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(event) => { event.stopPropagation(); onElimina(customer.customer_id); }}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                data-testid={`delete-customer-${customer.customer_id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {hasVerifiedAddress && <Badge variant="secondary">Indirizzo verificato</Badge>}
            {customer.notes && <Badge variant="outline">Note presenti</Badge>}
            {extraPhones.length > 0 && <Badge variant="outline">+{extraPhones.length} tel.</Badge>}
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{customer.phone}</span>
            </div>
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span className="line-clamp-2">{customer.address}</span>
            </div>
            {customer.fiscal_code && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CreditCard className="h-4 w-4" />
                <span className="truncate uppercase">{customer.fiscal_code}</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                data-testid={`quick-call-${customer.customer_id}`}>
                <a href={`tel:${customer.phone}`} onClick={(event) => event.stopPropagation()} title="Chiama">
                  <Phone className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                data-testid={`quick-map-${customer.customer_id}`}>
                <a href={linkMappa(customer)} target="_blank" rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()} title="Apri mappa">
                  <MapPin className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"
                data-testid={`quick-delivery-${customer.customer_id}`}>
                <Link to={linkConsegna(customer)} onClick={(event) => event.stopPropagation()} title="Nuova consegna">
                  <Package className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Profilo
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        </CardContent>
      </Card>
  );
}
