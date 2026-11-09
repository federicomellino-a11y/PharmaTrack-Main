import { vehicleLabels } from '@/lib/drivers';
import { Badge } from '../ui/badge';
import { Banknote } from 'lucide-react';
import { BarChart3 } from 'lucide-react';
import { Button } from '../ui/button';
import { CheckCircle2 } from 'lucide-react';
import { Clock } from 'lucide-react';
import { CreditCard } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { DialogContent } from '../ui/dialog';
import { DialogFooter } from '../ui/dialog';
import { DialogHeader } from '../ui/dialog';
import { DialogTitle } from '../ui/dialog';
import { Package } from 'lucide-react';
import { Pencil } from 'lucide-react';
import { Star } from 'lucide-react';
import { User } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { formatDateTime } from '@/lib/format';

/* Il profilo statistiche di un fattorino: KPI, stato consegne, soldi, performance, cliente top, ultima consegna.

   Estratto da Drivers.jsx: riceve dallo stato della pagina solo cio' che usa.
*/
export default function ProfiloFattorinoDialog({ chiudiProfilo, handleEdit, profileDriver, profileLoading, profileStats }) {
  return (
 <Dialog open={!!profileDriver} onOpenChange={(o) => { if (!o) chiudiProfilo(); }}>
   <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="driver-profile-dialog">
     <DialogHeader>
       <DialogTitle className="flex items-center gap-3">
         <div className={`w-11 h-11 rounded-full flex items-center justify-center ${profileDriver?.is_active ? 'bg-primary/10' : 'bg-secondary'}`}>
           <User className={`w-5 h-5 ${profileDriver?.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
         </div>
         <div className="flex-1">
           <span className="text-foreground">{profileDriver?.name}</span>
           <p className="text-xs text-muted-foreground font-normal mt-0.5">
             {vehicleLabels[profileDriver?.vehicle_type] || profileDriver?.vehicle_type} · {profileDriver?.phone}
           </p>
         </div>
         <Badge className={profileDriver?.is_active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-secondary text-muted-foreground'}>
           {profileDriver?.is_active ? 'Attivo' : 'Inattivo'}
         </Badge>
       </DialogTitle>
     </DialogHeader>

     {profileLoading ? (
       <div className="flex items-center justify-center py-12"><div className="spinner" /></div>
     ) : profileStats ? (
       <div className="space-y-5 py-2">
         {/* KPIs principali */}
         <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
           <div className="rounded-xl bg-secondary/40 p-3 text-center">
             <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Oggi</p>
             <p className="text-xl font-bold">{profileStats.counters.today}</p>
           </div>
           <div className="rounded-xl bg-secondary/40 p-3 text-center">
             <p className="text-[10px] uppercase tracking-wider text-muted-foreground">7 giorni</p>
             <p className="text-xl font-bold">{profileStats.counters.week}</p>
           </div>
           <div className="rounded-xl bg-secondary/40 p-3 text-center">
             <p className="text-[10px] uppercase tracking-wider text-muted-foreground">30 giorni</p>
             <p className="text-xl font-bold">{profileStats.counters.month}</p>
           </div>
           <div className="rounded-xl bg-secondary/40 p-3 text-center">
             <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Totali</p>
             <p className="text-xl font-bold">{profileStats.counters.delivered}</p>
           </div>
         </div>

         {/* Stato consegne */}
         <div className="grid grid-cols-3 gap-2">
           <div className="rounded-lg border border-border bg-card p-3">
             <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Package className="w-3 h-3" />In corso</p>
             <p className="text-lg font-semibold text-primary">{profileStats.counters.active}</p>
           </div>
           <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
             <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><Clock className="w-3 h-3" />Da confermare</p>
             <p className="text-lg font-semibold text-amber-600">{profileStats.counters.pending_confirm}</p>
           </div>
           <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
             <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" />Consegnate</p>
             <p className="text-lg font-semibold text-emerald-600">{profileStats.counters.delivered}</p>
           </div>
         </div>

         {/* Soldi */}
         <div>
           <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-primary" />Incassi totali</h3>
           <div className="grid grid-cols-3 gap-2">
             <div className="rounded-lg bg-emerald-500/10 p-3">
               <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><Banknote className="w-3 h-3" />Contanti</p>
               <p className="text-lg font-bold text-emerald-600">{formatCurrency(profileStats.money.cash_total)}</p>
             </div>
             <div className="rounded-lg bg-sky-500/10 p-3">
               <p className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-300 flex items-center gap-1"><CreditCard className="w-3 h-3" />POS</p>
               <p className="text-lg font-bold text-sky-600">{formatCurrency(profileStats.money.pos_total)}</p>
             </div>
             <div className="rounded-lg bg-primary/10 p-3">
               <p className="text-[10px] uppercase tracking-wider text-primary">Totale</p>
               <p className="text-lg font-bold text-primary">{formatCurrency(profileStats.money.revenue_total)}</p>
             </div>
           </div>
         </div>

         {/* Performance */}
         <div className="grid sm:grid-cols-2 gap-3">
           <div className="rounded-lg border border-border bg-card p-3">
             <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Tempo medio consegna</p>
             <p className="text-base font-semibold">
               {profileStats.avg_delivery_minutes != null ? `${profileStats.avg_delivery_minutes} min` : '—'}
             </p>
           </div>
           <div className="rounded-lg border border-border bg-card p-3">
             <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><Star className="w-3.5 h-3.5" />Turni effettuati</p>
             <p className="text-base font-semibold">
               {profileStats.shifts.total}
               <span className="text-xs text-muted-foreground ml-1.5">
                 ({profileStats.shifts.settled} confermati
                 {profileStats.shifts.pending > 0 && `, ${profileStats.shifts.pending} aperti`})
               </span>
             </p>
           </div>
         </div>

         {/* Cliente top */}
         {profileStats.top_customer && (
           <div className="rounded-lg border border-border bg-card p-3">
             <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5"><User className="w-3.5 h-3.5" />Cliente più servito</p>
             <p className="text-sm font-semibold">{profileStats.top_customer.name}</p>
             <p className="text-xs text-muted-foreground">{profileStats.top_customer.phone} · {profileStats.top_customer.count} consegne</p>
           </div>
         )}

         {/* Ultima consegna */}
         {profileStats.last_delivery && (
           <div className="rounded-lg border border-border bg-card p-3">
             <p className="text-xs text-muted-foreground mb-1">Ultima consegna</p>
             <p className="text-sm font-semibold">{profileStats.last_delivery.customer_name}</p>
             <p className="text-xs text-muted-foreground">{formatDateTime(profileStats.last_delivery.when)} · {formatCurrency(profileStats.last_delivery.amount)}</p>
           </div>
         )}
       </div>
     ) : (
       <p className="text-center text-muted-foreground py-8">Nessuna statistica disponibile.</p>
     )}

     <DialogFooter className="gap-2">
       <Button variant="outline" onClick={chiudiProfilo}>Chiudi</Button>
       <Button onClick={() => { const scelto = profileDriver; chiudiProfilo(); handleEdit(scelto); }}>
         <Pencil className="w-3.5 h-3.5 mr-1.5" />Modifica
       </Button>
     </DialogFooter>
   </DialogContent>
 </Dialog>

  );
}
