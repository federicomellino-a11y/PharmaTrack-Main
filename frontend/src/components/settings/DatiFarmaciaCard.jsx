import AddressAutocomplete from '../AddressAutocomplete';
import { Building2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { CardContent } from '../ui/card';
import { CardDescription } from '../ui/card';
import { CardHeader } from '../ui/card';
import { CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Save } from 'lucide-react';
import { Select } from '../ui/select';
import { SelectContent } from '../ui/select';
import { SelectItem } from '../ui/select';
import { SelectTrigger } from '../ui/select';
import { SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';

/* DatiFarmaciaCard: i dati della farmacia e i fattorini attivi.

   Estratto da Settings.jsx: la pagina teneva dieci schede in fila e nessuna
   si poteva leggere da sola. Riceve dallo stato della pagina solo cio' che usa.
*/
export default function DatiFarmaciaCard({ activeDrivers, formData, handleSubmit, saving, setFormData, settings }) {
  return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" />Dati Farmacia</CardTitle>
            <CardDescription>Configura le informazioni della tua farmacia</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome Farmacia</Label>
                <Input
                  value={formData.pharmacy_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, pharmacy_name: e.target.value }))}
                  placeholder="Es. Farmacia Centrale"
                />
              </div>

              <div>
                <AddressAutocomplete
                  label="Indirizzo Farmacia"
                  value={formData.pharmacy_address}
                  onChange={(value) => setFormData((prev) => ({ ...prev, pharmacy_address: value, pharmacy_lat: null, pharmacy_lng: null }))}
                  onAddressSelect={(selection) => setFormData((prev) => ({
                    ...prev,
                    pharmacy_address: selection.address,
                    pharmacy_lat: selection.lat,
                    pharmacy_lng: selection.lng,
                  }))}
                  placeholder="Es. Via Roma 123, Milano"
                  id="settings-pharmacy-address"
                />
                {formData.pharmacy_lat && formData.pharmacy_lng && (
                  <p className="text-xs text-emerald-600 mt-2">Indirizzo farmacia verificato sulla mappa</p>
                )}
              </div>

              <div>
                <Label>Telefono Farmacia</Label>
                <Input
                  value={formData.pharmacy_phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, pharmacy_phone: e.target.value }))}
                  placeholder="Es. +39 02 1234567"
                />
              </div>

              <Separator />

              <div>
                <Label>Fattorino Predefinito</Label>
                <Select
                  value={formData.default_driver_id || 'none'}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, default_driver_id: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger><SelectValue placeholder="Nessun fattorino predefinito" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {activeDrivers.map((driver) => (
                      <SelectItem key={driver.driver_id} value={driver.driver_id}>{driver.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Questo fattorino sarà suggerito automaticamente per le nuove consegne</p>
              </div>

              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Salvataggio...' : 'Salva Modifiche'}
              </Button>
            </form>
          </CardContent>
        </Card>

  );
}
