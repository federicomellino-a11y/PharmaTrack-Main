import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatCurrency } from '@/lib/format';
import { Calculator, ClipboardCheck } from 'lucide-react';

/* Passaggio a pronta, con il pagamento.

   Estratto da Deliveries.jsx: stava nella stessa pagina della lista e degli altri
   quattro dialoghi. Riceve dallo stato della pagina solo cio' che usa.
*/
export default function SegnaProntaDialog({ change_due, form, handleMarkPronta, prontaDialogOpen, resetForm, setForm, setProntaDialogOpen, setSelectedDelivery }) {
  return (
      <Dialog open={prontaDialogOpen} onOpenChange={(o) => { if (!o) { setSelectedDelivery(null); resetForm(); } setProntaDialogOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-amber-500" />Segna come Pronta
            </DialogTitle>
            <DialogDescription>
              Fase 2 — Aggiungi il metodo di pagamento per marcare la consegna come pronta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMarkPronta} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <Label>Pagamento</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 Contanti</SelectItem>
                    <SelectItem value="pos">💳 POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="form-group">
                <Label>Importo (€)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00" inputMode="decimal"
                  data-testid="delivery-amount-input"
                  value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              </div>
            </div>
            {form.payment_method === 'cash' && (
              <div className="form-group">
                <Label>Pagato con (€)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00" inputMode="decimal"
                  data-testid="delivery-amount-given-input"
                  value={form.amount_given} onChange={e => setForm({...form, amount_given: e.target.value})} />
              </div>
            )}
            {form.payment_method === 'cash' && change_due !== null && (
              <div className={`flex items-center gap-2 p-3 rounded-xl border ${change_due >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-destructive/10 border-destructive/20'}`}>
                <Calculator className={`w-4 h-4 ${change_due >= 0 ? 'text-emerald-600' : 'text-destructive'}`} />
                <span className={`text-2xl font-bold tabular-nums ${change_due >= 0 ? 'text-emerald-700' : 'text-destructive'}`}>
                  {change_due >= 0 ? `Resto: ${formatCurrency(change_due)}` : "Il pagato con non copre l'importo"}
                </span>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => { setProntaDialogOpen(false); setSelectedDelivery(null); resetForm(); }}>
                Annulla
              </Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white">
                <ClipboardCheck className="w-4 h-4 mr-1.5" />Segna come Pronta
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
}
