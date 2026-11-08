import AddressAutocomplete from '../AddressAutocomplete';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Plus, User, XCircle } from 'lucide-react';

/* Creazione veloce di un cliente dalla consegna.

   Estratto da Deliveries.jsx: stava nella stessa pagina della lista e degli altri
   quattro dialoghi. Riceve dallo stato della pagina solo cio' che usa.
*/
export default function NuovoClienteDialog({ createCustomerOpen, creatingCustomer, form, handleCreateCustomer, newCustomer, setCreateCustomerOpen, setNewCustomer }) {
  return (
      <Dialog open={createCustomerOpen} onOpenChange={setCreateCustomerOpen}>
        <DialogContent className="max-w-md" data-testid="create-customer-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />Nuovo Cliente
            </DialogTitle>
            <DialogDescription>
              Aggiungi un cliente al volo. Sarà selezionato automaticamente nella consegna.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCustomer} className="space-y-3 py-2">
            <div>
              <Label htmlFor="qc-name">Nome e cognome *</Label>
              <Input id="qc-name"
                placeholder="ROSSI MARIO"
                value={newCustomer.name}
                onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                className="h-11"
                autoFocus
                data-testid="qc-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="qc-phone">Telefono</Label>
                <Input id="qc-phone"
                  placeholder="333 1234567"
                  inputMode="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                  className="h-11"
                />
              </div>
              <div>
                <AddressAutocomplete
                  id="qc-address"
                  label="Indirizzo"
                  testId="qc-address-input"
                  placeholder="Via Roma 5, Volla (NA)"
                  value={newCustomer.address}
                  onChange={(value) => setNewCustomer((p) => ({ ...p, address: value, lat: null, lng: null, placeId: '' }))}
                  onAddressSelect={(sel) => setNewCustomer((p) => ({ ...p, address: sel.address, lat: sel.lat, lng: sel.lng, placeId: sel.placeId || '' }))}
                />
              </div>
            </div>
            <div>
              {(newCustomer.extraPhones || []).map((phone, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input type="tel" inputMode="tel" placeholder="Altro recapito"
                    data-testid={`create-customer-extra-phone-${index}`}
                    value={phone}
                    onChange={(e) => setNewCustomer({
                      ...newCustomer,
                      extraPhones: (newCustomer.extraPhones || []).map((p, i) => (i === index ? e.target.value : p)),
                    })} />
                  <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setNewCustomer({
                      ...newCustomer,
                      extraPhones: (newCustomer.extraPhones || []).filter((_, i) => i !== index),
                    })}>
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-fit h-8 text-xs"
                data-testid="add-customer-phone"
                onClick={() => setNewCustomer({
                  ...newCustomer,
                  extraPhones: [...(newCustomer.extraPhones || []), ''],
                })}>
                <Plus className="w-3 h-3 mr-1" />Aggiungi numero
              </Button>
              <Label htmlFor="qc-notes">Note (opzionale)</Label>
              <Input id="qc-notes"
                placeholder="Es: anziano, citofonare al cancello"
                value={newCustomer.notes}
                onChange={(e) => setNewCustomer((p) => ({ ...p, notes: e.target.value }))}
                className="h-11"
              />
            </div>
            <p className="text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2">
              💡 L'indirizzo potrai geolocalizzarlo dopo dalla scheda cliente per la navigazione del fattorino.
            </p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateCustomerOpen(false)}>
                Annulla
              </Button>
              <Button type="submit" className="btn-primary" disabled={creatingCustomer} data-testid="qc-submit-btn">
                {creatingCustomer ? 'Creazione…' : (<><Plus className="w-4 h-4 mr-1" />Crea e seleziona</>)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
}
