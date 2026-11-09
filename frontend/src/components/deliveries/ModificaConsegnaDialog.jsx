import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { formatCurrency } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/deliveryDisplay';

/* Modifica di una consegna esistente.

   Estratto da Deliveries.jsx: stava nella stessa pagina della lista e degli altri
   quattro dialoghi. Riceve dallo stato della pagina solo cio' che usa.
*/
/** Gli stati che la farmacia puo' scegliere a mano.
    'pending' resta fuori: e' il doppione storico di 'da_preparare'. */
export const STATI_MODIFICABILI = Object.entries(STATUS_LABELS)
  .filter(([valore]) => valore !== 'pending');

export default function ModificaConsegnaDialog({ modulo, editDialogOpen, handleEdit, setEditDialogOpen }) {
  const { form, setForm, change_due } = modulo;



  return (
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Consegna</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Pagamento</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Contanti</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="form-group">
                <Label>Importo (€)</Label>
                <Input type="number" step="0.01" inputMode="decimal" value={form.amount}
                  onChange={e => setForm({...form, amount: e.target.value})} />
              </div>
            </div>
            {form.payment_method === 'cash' && (
              <div className="form-group">
                <Label>Pagato con (€)</Label>
                <Input type="number" step="0.01" min="0" inputMode="decimal" value={form.amount_given}
                  onChange={e => setForm({...form, amount_given: e.target.value})} />
              </div>
            )}
            {form.payment_method === 'cash' && change_due !== null && (
              <p className={`text-base font-semibold tabular-nums ${change_due >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {change_due >= 0 ? `Resto calcolato: ${formatCurrency(change_due)}` : 'Il pagato con deve coprire l’importo totale'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Data</Label>
                <Input type="date" value={form.scheduled_date}
                  onChange={e => setForm({...form, scheduled_date: e.target.value})} />
              </div>
              <div className="form-group">
                <Label>Orario</Label>
                <Input type="time" value={form.scheduled_time}
                  onChange={e => setForm({...form, scheduled_time: e.target.value})} />
              </div>
            </div>
            <div className="form-group">
              <Label>Stato</Label>
              <Select value={form.status || ''} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue placeholder="Non cambiare" /></SelectTrigger>
                <SelectContent>
                  {STATI_MODIFICABILI.map(([valore, etichetta]) => (
                    <SelectItem key={valore} value={valore}>{etichetta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                La sequenza normale la segue la consegna da sola: qui si corregge.
              </p>
            </div>
            {form.status && (
              <div className="form-group">
                <Label>Motivo della correzione</Label>
                <Input value={form.force_reason || ''} onChange={e => setForm({ ...form, force_reason: e.target.value })}
                  placeholder="Serve se lo stato non e' il passo successivo" />
              </div>
)}
            <div className="form-group">
              <Label>Note</Label>
              <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="min-h-[80px]" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Annulla</Button>
              <Button type="submit" className="btn-primary">Salva</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
}
