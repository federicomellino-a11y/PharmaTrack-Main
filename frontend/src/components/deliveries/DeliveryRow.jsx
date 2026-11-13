import { useState } from 'react';
import { puoAnnullare, puoRipristinare } from '@/lib/deliveryActions';
import { soldiConsegna } from '@/lib/deliveryDisplay';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  Euro,
  MapPin,
  Package,
  Phone,
  Pencil,
  Printer,
  RotateCcw,
  Share2,
  Truck,
  XCircle,
  ChevronRight,
} from 'lucide-react';

import { formatCurrency, formatDateTime } from '@/lib/format';
import { testoFascia } from '@/lib/fasce';
import { printDeliveryLabel } from '@/lib/printLabel';
import {
  PRIORITY_ICONS,
  PRIORITY_LABELS,
  STATUS_ICONS,
  STATUS_LABELS,
  chiusaIl,
} from '@/lib/deliveryDisplay';

/* Una riga della lista consegne.

   Stava dentro Deliveries.jsx insieme a cinque dialoghi: per cambiare l'aspetto
   di una riga bisognava scorrere mille righe di altra roba. Riceve la consegna,
   i fattorini per risolvere il nome, la funzione che dice se e' in ritardo e i
   gesti (conferma incasso, contesta, consegnata, annulla, ripristina, condividi).
*/
export default function DeliveryRow({ d, drivers, inRitardo, handlers }) {
  const {
    handleConfirmPayment,
    handleDisputePayment,
    handleAdvanceStatus,
    handleCancel,
    handleRestore,
    shareDelivery,
    onPrintSlip,
    apriModifica,
    apriPronta,
    apriAssegna,
  } = handlers;

  // I dettagli (i farmaci del sacchetto, le note) restano chiusi finche' non si
  // tocca la riga: in una lista di venti consegne i testi aperti rendevano
  // illeggibile il resto.
  const [dettagliAperti, setDettagliAperti] = useState(false);
  const haDettagli = Boolean(d.notes);

  const StatusIcon = STATUS_ICONS[d.status] || Package;
  const driver = drivers.find((dr) => dr.driver_id === d.driver_id);
  const PriorityIcon = d.priority && PRIORITY_ICONS[d.priority];

  return (
                <Card key={d.delivery_id}
                onClick={haDettagli ? () => setDettagliAperti((aperto) => !aperto) : undefined}
                aria-expanded={haDettagli ? dettagliAperti : undefined}
                data-testid={`riga-consegna-${d.delivery_id}`}
                className={`
                  transition-all hover:shadow-md ${haDettagli ? 'cursor-pointer' : ''}
                  ${d.priority === 'urgent' ? 'border-l-4 border-l-destructive' : ''}
                  ${d.priority === 'high' ? 'border-l-4 border-l-amber-400' : ''}
                `}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Status icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                        ${d.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-600' :
                          d.status === 'delivered_pending_confirmation' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/30 animate-pulse-soft' :
                          d.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                          d.status === 'in_transit' ? 'bg-primary/10 text-primary' :
                          d.status === 'pronta' ? 'bg-green-500/10 text-green-600' :
                          'bg-secondary text-muted-foreground'}`}>
                        <StatusIcon className="w-5 h-5" />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="font-semibold text-sm">{d.customer_name}</span>
                          <Badge className={`status-${d.status} text-xs px-2 py-0`}>
                            {STATUS_LABELS[d.status]}
                          </Badge>
                          {d.priority && d.priority !== 'normal' && (
                            <Badge className={`priority-${d.priority} px-2 py-0`}>
                              {PriorityIcon && <PriorityIcon className="w-3 h-3 mr-1 inline" />}
                              {PRIORITY_LABELS[d.priority]}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{d.customer_address}
                          </span>
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />{d.customer_phone}
                          </span>
                          {driver && (
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3" />{driver.name}
                            </span>
                          )}
                          {['assigned', 'picked_up', 'in_transit'].includes(d.status) && d.driver_eta_minutes != null && (
                            <span className="flex items-center gap-1 font-medium text-primary" data-testid={`eta-${d.delivery_id}`}>
                              <Clock className="w-3 h-3" />≈ {d.driver_eta_minutes} min
                            </span>
                          )}
                          {d.scheduled_date && (
                            <span className="flex items-center gap-1 text-primary">
                              <Calendar className="w-3 h-3" />
                              {d.scheduled_date} {testoFascia(d.scheduled_time, d.slot_to)}
                            </span>
                          )}
                          {!d.scheduled_date && d.scheduled_time && (
                            <span className={`flex items-center gap-1 ${inRitardo(d) ? 'text-destructive font-medium' : 'text-primary'}`}>
                              <Clock className="w-3 h-3" />
                              {testoFascia(d.scheduled_time, d.slot_to)}
                              {inRitardo(d) && ' · in ritardo'}
                            </span>
                          )}
                          {d.scheduled_date && inRitardo(d) && (
                            <span className="flex items-center gap-1 text-destructive font-medium" data-testid="ritardo-lista">
                              in ritardo
                            </span>
                          )}
                          <span className="flex items-center gap-1" data-testid={`creata-${d.delivery_id}`}>
                            <Clock className="w-3 h-3" />Creata {formatDateTime(d.created_at)}
                          </span>
                          {chiusaIl(d) && (
                            <span className="flex items-center gap-1" data-testid={`chiusa-${d.delivery_id}`}>
                              <CheckCircle2 className="w-3 h-3" />Chiusa {formatDateTime(chiusaIl(d))}
                            </span>
                          )}
                        </div>
                        {haDettagli && (
                          <button
                            type="button"
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary"
                            data-testid={`apri-dettagli-${d.delivery_id}`}
                            onClick={(event) => { event.stopPropagation(); setDettagliAperti((aperto) => !aperto); }}
                          >
                            <ChevronRight className={`h-3 w-3 transition-transform ${dettagliAperti ? 'rotate-90' : ''}`} />
                            {dettagliAperti ? 'Nascondi dettagli' : 'Dettagli'}
                          </button>
                        )}
                        {haDettagli && dettagliAperti && (
                          <div className="mt-1.5 space-y-1 rounded-lg bg-secondary/40 px-2.5 py-1.5" data-testid={`dettagli-${d.delivery_id}`}>
                            {d.external_ref && (
                              <p className="text-[11px] text-muted-foreground" data-testid={`scontrino-${d.delivery_id}`}>
                                Scontrino {d.external_ref}
                              </p>
                            )}
                            <p className="whitespace-pre-line text-xs text-muted-foreground italic">📝 {d.notes}</p>
                          </div>
                        )}
                      </div>

                      {/* Amount + actions */}
                      <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
                        {d.amount && (
                          <div className="text-right">
                            {/* In grande l'incasso reale, cioe' quanto entra davvero:
                                il resto che il cliente si riprende non e' incasso.
                                Quando paga con un taglio piu' grande, il contante
                                ricevuto e il resto stanno sotto, in piccolo. */}
                            {(() => {
                              const soldi = soldiConsegna(d);
                              return (
                                <>
                                  <p className="font-bold text-base text-primary" data-testid={`amount-${d.delivery_id}`}>{formatCurrency(soldi.incasso)}</p>
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                                    {d.payment_method === 'cash'
                                      ? <><Banknote className="w-3 h-3" />Contanti</>
                                      : <><CreditCard className="w-3 h-3" />POS</>}
                                  </p>
                                  {soldi.pagato !== null && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight whitespace-nowrap">
                                      Pagato {formatCurrency(soldi.pagato)} · Resto {formatCurrency(soldi.resto)}
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                        {['da_preparare', 'pronta', 'pending', 'assigned', 'picked_up', 'in_transit', 'delivered_pending_confirmation'].includes(d.status) && (
                          <div className="delivery-card-actions flex gap-1.5 flex-wrap justify-end">
                            {d.status === 'delivered_pending_confirmation' && (
                              <>
                                <Button size="sm" className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md"
                                  onClick={() => handleConfirmPayment(d)}
                                  data-testid={`confirm-payment-${d.delivery_id}`}>
                                  <Euro className="w-3.5 h-3.5 mr-1" />Conferma incasso
                                </Button>
                                <Button variant="outline" size="sm" className="h-8 px-2 text-xs text-amber-700 border-amber-500/40 hover:bg-amber-500/10"
                                  onClick={() => handleDisputePayment(d)}
                                  title="Contesta">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => shareDelivery(d)}
                              title="Condividi link tracking (WhatsApp)">
                              <Share2 className="w-3 h-3" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => onPrintSlip(d)}
                              title="Stampa bolla">
                              <Printer className="w-3 h-3" />
                            </Button>
                            {d.status !== 'delivered_pending_confirmation' && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
onClick={() => apriModifica(d)}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                            {['da_preparare', 'pending'].includes(d.status) && (
                              <Button size="sm" className="h-7 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-white"
onClick={() => apriPronta(d)}>
                                <ClipboardCheck className="w-3 h-3 mr-1" />Pronta
                              </Button>
                            )}
                            {['pronta', 'assigned', 'picked_up'].includes(d.status) && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                                onClick={() => apriAssegna(d)}>
                                <Truck className="w-3 h-3" />
                              </Button>
                            )}
                            {['assigned', 'picked_up'].includes(d.status) && (
                              <Button size="sm" className="h-7 px-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                                onClick={() => handleAdvanceStatus(d)}>
                                <ChevronRight className="w-3 h-3 mr-1" />Avvia
                              </Button>
                            )}
                            {d.status === 'in_transit' && (
                              <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => handleAdvanceStatus(d)}>
                                <CheckCircle2 className="w-3 h-3 mr-1" />Consegnata
                              </Button>
                            )}
                            {puoAnnullare(d.status) && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                data-testid={`cancel-delivery-${d.delivery_id}`}
                                onClick={() => handleCancel(d.delivery_id)}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            )}
                            {(
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              data-testid={`print-label-${d.delivery_id}`}
                              onClick={(event) => { event.stopPropagation(); printDeliveryLabel(d); }}
                              title="Stampa etichetta"
                            >
                              <Printer className="w-3 h-3 mr-1" />Etichetta
                            </Button>
                          )}
                          {puoRipristinare(d.status) && (
                              <Button variant="outline" size="sm" className="h-7 px-2 text-xs"
                                data-testid={`restore-delivery-${d.delivery_id}`}
                                onClick={() => handleRestore(d.delivery_id)}>
                                <RotateCcw className="w-3 h-3 mr-1" />Ripristina
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
  );
}
