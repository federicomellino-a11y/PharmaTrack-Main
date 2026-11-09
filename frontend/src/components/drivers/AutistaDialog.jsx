import { generatePassword } from '@/lib/password';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { DialogContent } from '../ui/dialog';
import { DialogFooter } from '../ui/dialog';
import { DialogHeader } from '../ui/dialog';
import { DialogTitle } from '../ui/dialog';
import { Eye } from 'lucide-react';
import { EyeOff } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select } from '../ui/select';
import { SelectContent } from '../ui/select';
import { SelectItem } from '../ui/select';
import { SelectTrigger } from '../ui/select';
import { SelectValue } from '../ui/select';
import { Zap } from 'lucide-react';

/* AutistaDialog: estratto da Drivers.jsx.

   La pagina teneva dentro due dialoghi oltre alla griglia; qui il dialogo riceve
   dallo stato della pagina solo cio' che usa.
*/
export default function AutistaDialog({ dialogOpen, editingDriver, formData, handleSubmit, setDialogOpen, setFormData, setShowPassword, showPassword }) {
  return (
 <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="text-foreground">
 {editingDriver ? 'Modifica Fattorino' : 'Nuovo Fattorino'}
 </DialogTitle>
 </DialogHeader>
 <form onSubmit={handleSubmit}>
 <div className="space-y-4 py-4">
 <div className="form-group">
 <Label htmlFor="name">Nome completo *</Label>
 <Input
 id="name"
 value={formData.name}
 onChange={(e) => setFormData({ ...formData, name: e.target.value })}
 placeholder="Marco Verdi"
 required
 className=""
 data-testid="driver-name-input"
 />
 </div>
 <div className="form-group">
 <Label htmlFor="phone">Telefono *</Label>
 <Input
 id="phone"
 value={formData.phone}
 onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
 placeholder="+39 333 1234567"
 required
 className=""
 data-testid="driver-phone-input"
 />
 </div>
 <div className="form-group">
 <Label htmlFor="email">Email (per accesso) *</Label>
 <Input
 id="email"
 type="email"
 value={formData.email}
 onChange={(e) => setFormData({ ...formData, email: e.target.value })}
 placeholder="marco@email.com"
 required
 disabled={!!editingDriver}
 className="disabled:opacity-50"
 data-testid="driver-email-input"
 />
 </div>
 <div className="form-group">
 <Label htmlFor="password">
 Password {editingDriver ? '(lascia vuoto per non modificare)' : '*'}
 </Label>
 <div className="flex gap-2">
 <div className="relative flex-1">
 <Input
 id="password"
 type={showPassword ? 'text' : 'password'}
 value={formData.password}
 onChange={(e) => setFormData({ ...formData, password: e.target.value })}
 placeholder="••••••••"
 required={!editingDriver}
 className="pr-10"
 autoComplete="new-password"
 data-testid="driver-password-input"
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-zinc-300"
 >
 {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
 </button>
 </div>
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="shrink-0 gap-1 border-primary/40 text-primary hover:bg-primary/10"
 onClick={() => {
   const pwd = generatePassword();
   setFormData(f => ({ ...f, password: pwd }));
   setShowPassword(true);
 }}
 title="Genera password sicura"
 >
 <Zap className="w-3.5 h-3.5" />Genera
 </Button>
 </div>
 </div>
 <div className="form-group">
 <Label>Tipo veicolo</Label>
 <Select
 value={formData.vehicle_type}
 onValueChange={(value) => setFormData({ ...formData, vehicle_type: value })}
 >
 <SelectTrigger className=""data-testid="driver-vehicle-select">
 <SelectValue />
 </SelectTrigger>
 <SelectContent className="">
 <SelectItem value="scooter">Scooter</SelectItem>
 <SelectItem value="bike">Bicicletta</SelectItem>
 <SelectItem value="car">Auto</SelectItem>
 <SelectItem value="van">Furgone</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>
 <DialogFooter>
 <Button
 type="button"
 variant="outline"
 onClick={() => setDialogOpen(false)}
 className=""
 >
 Annulla
 </Button>
 <Button
 type="submit"
 className="btn-primary"
 data-testid="save-driver-btn"
 >
 {editingDriver ? 'Salva Modifiche' : 'Crea Fattorino'}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
  );
}
