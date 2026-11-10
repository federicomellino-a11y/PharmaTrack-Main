import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { FASCE, testoFasciaBreve } from '@/lib/fasce';
import { avvisoConsegnaAperta } from '@/lib/consegneAperte';
import { formatCurrency } from '@/lib/format';
import { Package, Plus, Search, User, XCircle } from 'lucide-react';

/* Creazione di una consegna (fase 1: cliente e note).

   Estratto da Deliveries.jsx: stava nella stessa pagina della lista e degli altri
   quattro dialoghi. Riceve dallo stato della pagina solo cio' che usa.
*/
export default function CreaConsegnaDialog({ consegneAperte = [], fasce = FASCE, modulo, activeCustomerIndex, applicaFascia, customerDropdownOpen, customerInputRef, customerSearchTerm, dialogCustomers, dialogOpen, frequentCustomers, handleCreate, openCreateCustomer, resetForm, selectCustomer, selectedCustomer, setActiveCustomerIndex, setCustomerDropdownOpen, setCustomerSearchTerm, setDialogOpen }) {
  const { form, setForm, fasciaScelta, change_due } = modulo;
  // Un cliente che ha gia' una consegna in corso: si dice mentre si compila,
  // non dopo, quando il server risponde 409.
  const avviso = avvisoConsegnaAperta(consegneAperte);



  return (
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />Nuova Consegna
            </DialogTitle>
            <DialogDescription>
              Fase 1 — Seleziona cliente e aggiungi note. Il pagamento si aggiunge quando la consegna è pronta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="form-group space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cliente *</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-primary px-2"
                  onClick={() => openCreateCustomer(customerSearchTerm)}
                  data-testid="open-create-customer-btn">
                  <Plus className="w-3 h-3 mr-1" />Nuovo cliente
                </Button>
              </div>
              {selectedCustomer ? (
                <>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{selectedCustomer.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedCustomer.phone && <span>{selectedCustomer.phone} · </span>}
                      {selectedCustomer.address}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                    onClick={() => { setForm({...form, customer_id: 'none'}); setCustomerSearchTerm(''); setTimeout(() => customerInputRef.current?.focus(), 50); }}>
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
                {avviso && (
                  <p
                    className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400"
                    data-testid="avviso-consegna-aperta"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {avviso}
                  </p>
                )}
                </>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                  <Input
                    ref={customerInputRef}
                    autoFocus
                    data-testid="delivery-customer-search"
                    placeholder="Cerca per nome, telefono o indirizzo..."
                    value={customerSearchTerm}
                    onChange={(e) => { setCustomerSearchTerm(e.target.value); setCustomerDropdownOpen(true); setActiveCustomerIndex(-1); }}
                    onKeyDown={(e) => {
                      if (!customerDropdownOpen) return;
                      const list = customerSearchTerm.trim() ? dialogCustomers.slice(0, 60) : frequentCustomers;
                      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveCustomerIndex((i) => Math.min(i + 1, list.length - 1)); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveCustomerIndex((i) => Math.max(i - 1, 0)); }
                      else if (e.key === 'Enter' && activeCustomerIndex >= 0 && list[activeCustomerIndex]) { e.preventDefault(); selectCustomer(list[activeCustomerIndex]); }
                      else if (e.key === 'Escape') { setCustomerDropdownOpen(false); }
                    }}
                    onFocus={() => setCustomerDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 150)}
                    className="pl-9"
                    autoComplete="off"
                  />
                  {customerDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                      <div className="max-h-64 overflow-y-auto overscroll-contain" data-testid="customer-list-scroll">
                        {dialogCustomers.length === 0 ? (
                          <div className="p-4 text-center">
                            <p className="text-sm text-muted-foreground mb-2">Nessun cliente trovato</p>
                            <Button type="button" variant="outline" size="sm" onMouseDown={() => openCreateCustomer(customerSearchTerm)}>
                              <Plus className="w-3.5 h-3.5 mr-1" />Aggiungi cliente
                            </Button>
                          </div>
                        ) : (
                          <>
                            {!customerSearchTerm.trim() && frequentCustomers.length > 0 && (
                              <p className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">I più frequenti</p>
                            )}
                            {(customerSearchTerm.trim() ? dialogCustomers.slice(0, 60) : frequentCustomers).map((c, i) => (
                              <button type="button" key={c.customer_id}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-border/50 last:border-0 ${i === activeCustomerIndex ? 'bg-accent' : 'hover:bg-accent'}`}
                                onMouseEnter={() => setActiveCustomerIndex(i)}
                                onMouseDown={() => selectCustomer(c)}>
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <User className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{c.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {c.phone ? `${c.phone} · ` : ''}{c.address}
                                  </p>
                                </div>
                              </button>
                            ))}

                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="form-group space-y-2">
              <Label>Priorità</Label>
              <button type="button"
                onClick={() => setForm({ ...form, priority: form.priority === 'urgent' ? 'normal' : 'urgent' })}
                className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  form.priority === 'urgent'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                data-testid="priority-urgent-toggle">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {form.priority === 'urgent' ? 'Urgente' : 'Segna come urgente'}
              </button>
            </div>



            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Data programmata</Label>
                <Input type="date" value={form.scheduled_date}
                  onChange={e => setForm({...form, scheduled_date: e.target.value})} />
              </div>
              <div className="form-group">
                <Label>Fascia oraria</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={fasciaScelta}
                  onChange={e => applicaFascia(e.target.value)}
                  data-testid="scelta-fascia"
                >
                  {fasce.map(f => <option key={f.valore} value={f.valore}>{testoFasciaBreve(f)}</option>)}
                </select>
              </div>
            </div>

            {fasciaScelta === 'preciso' && (
              <div className="grid grid-cols-2 gap-3" data-testid="fascia-manuale">
                <div className="form-group">
                  <Label>Dalle</Label>
                  <Input type="time" value={form.scheduled_time || ''}
                    onChange={e => setForm({ ...form, scheduled_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <Label>Entro le</Label>
                  <Input type="time" value={form.slot_to || ''}
                    onChange={e => setForm({ ...form, slot_to: e.target.value })} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Importo (€) — opzionale</Label>
                <Input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
                  value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              </div>
              <div className="form-group">
                <Label>Metodo di pagamento</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                  <SelectTrigger data-testid="create-payment-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 Contanti</SelectItem>
                    <SelectItem value="pos">💳 POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.payment_method === 'cash' && (
              <div className="form-group">
                <Label>Pagato con (€)</Label>
                <Input type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
                  value={form.amount_given} onChange={e => setForm({...form, amount_given: e.target.value})} />
              </div>
            )}
            {form.payment_method === 'cash' && change_due !== null && (
              <p className={`text-lg font-bold text-center py-1 ${change_due >= 0 ? 'text-emerald-600' : 'text-destructive'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {change_due >= 0 ? `Resto: ${formatCurrency(change_due)}` : 'Il pagato con deve coprire l’importo'}
              </p>
            )}
            <div className="form-group">
              <Label>Note / Farmaci</Label>
              <Textarea placeholder="Es: Augmentin 1g, Tachipirina 1000..." value={form.notes}
                onChange={e => setForm({...form, notes: e.target.value})} className="min-h-[80px]" />
              <div className="flex flex-wrap gap-1.5">
                {['Ritirare ricetta', 'Chiamare all\'arrivo', 'Solo pomeriggio', 'Frigorifero', 'Lasciare al portiere'].map(chip => (
                  <button key={chip} type="button"
                    onClick={() => setForm(f => ({ ...f, notes: f.notes ? `${f.notes}, ${chip}` : chip }))}
                    className="px-2 h-7 rounded-full border border-border text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    data-testid="note-chip">
                    + {chip}
                  </button>
                ))}
              </div>
            </div>


            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Annulla
              </Button>
              <Button type="submit" className="btn-primary" data-testid="create-delivery-submit">
                <Package className="w-4 h-4 mr-1.5" />Crea Consegna
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
}
