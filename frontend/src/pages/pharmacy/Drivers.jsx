import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useDriversQuery } from '@/hooks/queries';
import { chiavi, letture } from '@/lib/api';
import { API } from '@/lib/config';
import AutistaDialog from '../../components/drivers/AutistaDialog';
import CredenzialiDialog from '../../components/drivers/CredenzialiDialog';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import {
 Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../../components/ui/select';
import {
 Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '../../components/ui/dialog';
import {
 Search, Plus, Pencil, Trash2, Truck, Phone, Mail, Eye, EyeOff,
 Copy, Check, Zap, KeyRound, BarChart3, Banknote, CreditCard, Clock,
 User, Star, Package, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

// Il limite del piano arriva come 402: va spiegato, non mostrato come guasto.
import { formatCurrency, formatDateTime } from '@/lib/format';
const messaggioPiano = (errore, ripiego) =>
  errore?.response?.status === 402
    ? (errore.response.data?.detail || 'Limite del piano raggiunto.')
    : ripiego;
import { ensureArray } from '@/lib/collections';
import { useAuth } from '../../contexts/AuthContext';
import { confirmAction } from '../../components/ConfirmDialog';

export default function DriversPage() {
 const { user, updateProfile } = useAuth();
 const queryClient = useQueryClient();
 const { data: driversData = [], isLoading: loading } = useDriversQuery();
 const drivers = ensureArray(driversData);
 const [searchTerm, setSearchTerm] = useState('');
 const [dialogOpen, setDialogOpen] = useState(false);
 const [editingDriver, setEditingDriver] = useState(null);
 const [showPassword, setShowPassword] = useState(false);
 const [credentialsDialog, setCredentialsDialog] = useState(null);
 const [copied, setCopied] = useState('');
 const [profileDriver, setProfileDriver] = useState(null);
 const [profileStats, setProfileStats] = useState(null);
 const [profileLoading, setProfileLoading] = useState(false);
 const [formData, setFormData] = useState({
 name: '',
 phone: '',
 email: '',
 password: '',
 vehicle_type: 'scooter'
 });

 const fetchDrivers = () => queryClient.invalidateQueries({ queryKey: ['drivers'] });

 const handleSubmit = async (e) => {
 e.preventDefault();
 try {
 if (editingDriver) {
 const updateData = { ...formData };
 if (!updateData.password) delete updateData.password;
 await axios.put(`${API}/drivers/${editingDriver.driver_id}`, updateData, { withCredentials: true });
 toast.success('Fattorino aggiornato');
 setDialogOpen(false);
 resetForm();
 fetchDrivers();
 } else {
 const { data: newDriver } = await axios.post(`${API}/drivers`, formData, { withCredentials: true });
 setDialogOpen(false);
 setCredentialsDialog({ name: formData.name, email: formData.email, password: formData.password });
 resetForm();
 fetchDrivers();
 if (!user?.settings?.default_driver_id && newDriver?.driver_id) {
 toast('Impostarlo come fattorino predefinito?', {
 description: "Le nuove consegne verranno assegnate automaticamente.",
 action: { label: 'Sì, predefinito', onClick: () => handleSetDefaultDriver(newDriver) },
 duration: 12000,
 id: 'default-driver-onboarding',
 });
 }
 }
 } catch (err) {
 toast.error(messaggioPiano(err, err.response?.data?.detail || 'Errore'));
 }
 };

 const copyToClipboard = async (text, key) => {
 try {
 await navigator.clipboard.writeText(text);
 setCopied(key);
 setTimeout(() => setCopied(''), 2000);
 } catch {
 toast.error('Copia non riuscita');
 }
 };

 const handleEdit = (driver) => {
 setEditingDriver(driver);
 setFormData({
 name: driver.name,
 phone: driver.phone,
 email: driver.email,
 password: '',
 vehicle_type: driver.vehicle_type
 });
 setDialogOpen(true);
 };

 const handleToggleActive = async (driver) => {
 try {
 await axios.put(`${API}/drivers/${driver.driver_id}`,
 { is_active: !driver.is_active },
 { withCredentials: true }
 );
 toast.success(driver.is_active ? 'Fattorino disattivato' : 'Fattorino attivato');
 fetchDrivers();
 } catch (err) {
 toast.error('Errore');
 }
 };

 const handleSetDefaultDriver = async (driver) => {
 try {
 await updateProfile({ settings: { ...(user?.settings || {}), default_driver_id: driver.driver_id } });
 toast.success(`${driver.name} è ora il fattorino predefinito — le nuove consegne gli verranno assegnate automaticamente`);
 fetchDrivers();
 } catch (err) {
 toast.error('Errore impostazione predefinito');
 }
 };

 const handleDelete = async (driverId) => {
 if (!(await confirmAction({ title: 'Eliminare questo fattorino?', description: "Non potra piu accedere all'app.", confirmLabel: 'Elimina', destructive: true }))) return;
 try {
 await axios.delete(`${API}/drivers/${driverId}`, { withCredentials: true });
 toast.success('Fattorino eliminato');
 fetchDrivers();
 } catch (err) {
 toast.error('Errore eliminazione');
 }
 };

 const resetForm = () => {
 setEditingDriver(null);
 setFormData({ name: '', phone: '', email: '', password: '', vehicle_type: 'scooter' });
 setShowPassword(false);
 };

 const openNewDialog = () => {
 resetForm();
 setDialogOpen(true);
 };

 const vehicleLabels = {
 scooter: 'Scooter',
 bike: 'Bicicletta',
 car: 'Auto',
 van: 'Furgone'
 };

 const safeDrivers = ensureArray(drivers);

 const filteredDrivers = safeDrivers.filter(d =>
 (d.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 (d.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
 d.phone.includes(searchTerm)
 );

 if (loading) {
 return (
 <Layout title="Fattorini">
 <div className="flex items-center justify-center h-64">
 <div className="spinner"></div>
 </div>
 </Layout>
 );
 }

 return (
 <Layout title="Fattorini">
 <div className="space-y-6"data-testid="drivers-page">
 {/* Header */}
 <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-foreground">Anagrafica Fattorini</h1>
 <p className="text-muted-foreground">{safeDrivers.length} fattorini registrati</p>
 </div>
 <Button
 onClick={openNewDialog}
 className="btn-primary"
 data-testid="add-driver-btn"
 >
 <Plus className="w-4 h-4 mr-2"/>
 Nuovo Fattorino
 </Button>
 </div>

 {/* Search */}
 <div className="relative max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
 <Input
 placeholder="Cerca per nome, email o telefono..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-10"
 data-testid="search-drivers"
 />
 </div>

 {/* Drivers Grid */}
 {filteredDrivers.length === 0 ? (
 <Card className="">
 <CardContent className="py-12 text-center">
 <Truck className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4"/>
 <p className="text-muted-foreground">
 {searchTerm ? 'Nessun fattorino trovato' : 'Nessun fattorino registrato'}
 </p>
 {!searchTerm && (
 <Button
 onClick={openNewDialog}
 variant="outline"
 className="mt-4"
 >
 Aggiungi il primo fattorino
 </Button>
 )}
 </CardContent>
 </Card>
 ) : (
 <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
 {filteredDrivers.map((driver, index) => (
 <Card
 key={driver.driver_id}
 className={` hover:border-primary/30 transition-colors animate-slide-up stagger-${(index % 5) + 1}`}
 >
 <CardContent className="p-5">
 <div className="flex items-start justify-between mb-4">
 <div className="flex items-center gap-3">
 <div className={`w-10 h-10 rounded-full flex items-center justify-center ${driver.is_active ? 'bg-primary/10' : 'bg-secondary'}`}>
 <Truck className={`w-5 h-5 ${driver.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
 </div>
 <div>
 <h3 className="font-semibold text-foreground">{driver.name}</h3>
 <Badge className={driver.is_active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-secondary text-muted-foreground'}>
 {driver.is_active ? 'Attivo' : 'Inattivo'}
 </Badge>
 </div>
 </div>
 <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleEdit(driver)}
 className="h-8 w-8 text-muted-foreground hover:text-foreground"
 data-testid={`edit-driver-${driver.driver_id}`}
 >
 <Pencil className="w-4 h-4"/>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleDelete(driver.driver_id)}
 className="h-8 w-8 text-muted-foreground hover:text-destructive"
 data-testid={`delete-driver-${driver.driver_id}`}
 >
 <Trash2 className="w-4 h-4"/>
 </Button>
 </div>
 </div>
 <div className="space-y-2 text-sm">
 <div className="flex items-center gap-2 text-muted-foreground">
 <Phone className="w-4 h-4"/>
 <span>{driver.phone}</span>
 </div>
 <div className="flex items-center gap-2 text-muted-foreground">
 <Mail className="w-4 h-4"/>
 <span className="truncate">{driver.email}</span>
 </div>
 <div className="flex items-center gap-2 text-muted-foreground">
 <Truck className="w-4 h-4"/>
 <span>{vehicleLabels[driver.vehicle_type] || driver.vehicle_type}</span>
 </div>
 </div>
 <div className="mt-4 pt-4 border-t flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
 <Button
   variant="outline"
   size="sm"
   className="h-8 text-xs gap-1.5"
   onClick={async () => {
     setProfileDriver(driver);
     setProfileStats(null);
     setProfileLoading(true);
     try {
       const r = await queryClient.fetchQuery({
         queryKey: chiavi.statsFattorino(driver.driver_id),
         queryFn: letture.statsFattorino(driver.driver_id),
       });
       setProfileStats(r);
     } catch (err) {
       console.error('Errore caricamento stats:', err);
       toast.error('Errore caricamento statistiche');
     } finally {
       setProfileLoading(false);
     }
   }}
   data-testid={`stats-driver-${driver.driver_id}`}
 >
   <BarChart3 className="w-3.5 h-3.5" />Statistiche
 </Button>
 <Button variant={user?.settings?.default_driver_id === driver.driver_id ? 'default' : 'outline'} size="sm" className="h-7 px-2 text-xs"
   onClick={() => handleSetDefaultDriver(driver)}
   disabled={!driver.is_active}
   title={user?.settings?.default_driver_id === driver.driver_id ? 'Fattorino predefinito' : 'Imposta come predefinito'}
   data-testid={`default-driver-${driver.driver_id}`}>
   <Star className={`w-3 h-3 ${user?.settings?.default_driver_id === driver.driver_id ? 'fill-current' : ''}`} />
   {user?.settings?.default_driver_id === driver.driver_id ? 'Predefinito' : 'Predef.'}
 </Button>
 <div className="flex items-center gap-2">
   <span className="text-xs text-muted-foreground">Attivo</span>
   <Switch
     checked={driver.is_active}
     onCheckedChange={() => handleToggleActive(driver)}
     data-testid={`toggle-driver-${driver.driver_id}`}
   />
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 )}

 {/* Dialog */}
      <AutistaDialog
        {...{
        dialogOpen,
        editingDriver,
        formData,
        handleSubmit,
        setDialogOpen,
        setFormData,
        setShowPassword,
        showPassword,
        }}
      />
 </div>

 {/* Credentials Dialog (shown after creating a new driver) */}
      <CredenzialiDialog
        {...{
        copied,
        copyToClipboard,
        credentialsDialog,
        setCredentialsDialog,
        }}
      />

 {/* Profile Driver Dialog (stats) */}
 <Dialog open={!!profileDriver} onOpenChange={(o) => { if (!o) { setProfileDriver(null); setProfileStats(null); } }}>
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
       <Button variant="outline" onClick={() => { setProfileDriver(null); setProfileStats(null); }}>Chiudi</Button>
       <Button onClick={() => { const d = profileDriver; setProfileDriver(null); handleEdit(d); }}>
         <Pencil className="w-3.5 h-3.5 mr-1.5" />Modifica
       </Button>
     </DialogFooter>
   </DialogContent>
 </Dialog>

 </Layout>
 );
}
