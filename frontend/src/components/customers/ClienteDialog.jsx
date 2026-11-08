import AddressAutocomplete from '../AddressAutocomplete';
import { ensureArray } from '@/lib/collections';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { PlusCircle, X } from 'lucide-react';

/* Dialog di creazione e modifica cliente.

   Era una variabile dentro Customers.jsx (`const customerDialog = (...)`), 158
   righe in mezzo alla pagina, usata sia nella lista sia nella scheda del
   cliente. Qui riceve solo lo stato che usa.
*/
export default function ClienteDialog({ dialogOpen, editingCustomer, formData, handleSubmit, setDialogOpen, setFormData }) {
  return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? 'Modifica cliente' : 'Nuovo cliente'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="form-group sm:col-span-2">
                    <Label htmlFor="name">Nome completo *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                      placeholder="Mario Rossi"
                      required
                      data-testid="customer-name-input"
                    />
                  </div>
                  <div className="form-group">
                    <Label htmlFor="phone">Telefono *</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                      placeholder="+39 333 1234567"
                      required
                      data-testid="customer-phone-input"
                    />
                  </div>
                  <div className="form-group">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      placeholder="mario@email.com"
                      data-testid="customer-email-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <AddressAutocomplete
                    id="address"
                    label="Indirizzo"
                    required
                    testId="customer-address-input"
                    value={formData.address}
                    onChange={(value) => setFormData({ ...formData, address: value, customer_lat: null, customer_lng: null, place_id: '' })}
                    onAddressSelect={(selection) => setFormData({
                      ...formData,
                      address: selection.address,
                      customer_lat: selection.lat,
                      customer_lng: selection.lng,
                      place_id: selection.placeId || '',
                    })}
                    placeholder="Via Rossi 119, 80040 Volla (NA)"
                  />
                  {formData.customer_lat && formData.customer_lng && (
                    <p className="text-xs text-emerald-600">Indirizzo verificato sulla mappa</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="form-group">
                    <Label htmlFor="fiscal_code">Codice fiscale</Label>
                    <Input
                      id="fiscal_code"
                      value={formData.fiscal_code}
                      onChange={(event) => setFormData({ ...formData, fiscal_code: event.target.value.toUpperCase() })}
                      placeholder="RSSMRA80A01H501U"
                      className="uppercase"
                      data-testid="customer-fiscal-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <Label>Telefoni aggiuntivi</Label>
                  <div className="space-y-2 mt-1">
                    {ensureArray(formData.extra_phones).map((phone, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          type="tel"
                          value={phone}
                          onChange={(e) => {
                            const phones = [...ensureArray(formData.extra_phones)];
                            phones[i] = e.target.value;
                            setFormData({ ...formData, extra_phones: phones });
                          }}
                          placeholder={`Telefono ${i + 2}`}
                          data-testid={`customer-extra-phone-${i}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const phones = [...ensureArray(formData.extra_phones)];
                            phones.splice(i, 1);
                            setFormData({ ...formData, extra_phones: phones });
                          }}
                          className="h-10 w-10 text-muted-foreground hover:text-destructive flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormData({ ...formData, extra_phones: [...ensureArray(formData.extra_phones), ''] })}
                      className="gap-2 text-muted-foreground"
                      data-testid="add-extra-phone-btn"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Aggiungi numero
                    </Button>
                  </div>
                </div>

                <div className="form-group">
                  <Label htmlFor="notes">Note</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(event) => setFormData({ ...formData, notes: event.target.value })}
                    placeholder="Allergie, citofono, preferenze di consegna…"
                    data-testid="customer-notes-input"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" className="btn-primary" data-testid="save-customer-btn">
                  {editingCustomer ? 'Salva modifiche' : 'Crea cliente'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
  );
}
