import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '@/lib/config';
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
import { ensureArray } from '@/lib/collections';

const generatePassword = () => {
 const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
 const lower = 'abcdefghjkmnpqrstuvwxyz';
 const digits = '23456789';
 const special = '!@#$%';
 const all = upper + lower + digits + special;
 let pwd = [
   upper[Math.floor(Math.random() * upper.length)],
   lower[Math.floor(Math.random() * lower.length)],
   digits[Math.floor(Math.random() * digits.length)],
   special[Math.floor(Math.random() * special.length)],
 ];
 for (let i = 0; i < 6; i++) pwd.push(all[Math.floor(Math.random() * all.length)]);
 return pwd.sort(() => Math.random() - 0.5).join('');
};

const formatCurrency = (v) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0);
const formatDateTime = (d) => d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

export default function DriversPage() {
 const [drivers, setDrivers] = useState([]);
 const [loading, setLoading] = useState(true);
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

 useEffect(() => {
 fetchDrivers();
 }, []);

 const fetchDrivers = async () => {
 try {
 const response = await axios.get(`${API}/drivers`, { withCredentials: true });
 setDrivers(ensureArray(response.data));
 } catch (err) {
 toast.error('Errore nel caricamento fattorini');
 } finally {
 setLoading(false);
 }
 };

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
 await axios.post(`${API}/drivers`, formData, { withCredentials: true });
 setDialogOpen(false);
 setCredentialsDialog({ name: formData.name, email: formData.email, password: formData.password });
 resetForm();
 fetchDrivers();
 }
 } catch (err) {
 toast.error(err.response?.data?.detail || 'Errore');
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

 const handleDelete = async (driverId) => {
 if (!window.confirm('Eliminare questo fattorino?')) return;
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
       const r = await axios.get(`${API}/drivers/${driver.driver_id}/stats`, { withCredentials: true });
       setProfileStats(r.data);
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
 </div>

 {/* Credentials Dialog (shown after creating a new driver) */}
 <Dialog open={!!credentialsDialog} onOpenChange={() => setCredentialsDialog(null)}>
 <DialogContent className="max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-foreground">
 <KeyRound className="w-5 h-5 text-primary" />
 Fattorino creato!
 </DialogTitle>
 </DialogHeader>
 <div className="space-y-4 py-2">
 <p className="text-sm text-muted-foreground">
 Condividi queste credenziali con <span className="text-foreground font-semibold">{credentialsDialog?.name}</span> per permettergli di accedere all'app.
 </p>
 <div className="space-y-2">
 <Label className="text-muted-foreground text-xs uppercase tracking-wide">Email</Label>
 <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
 <span className="flex-1 text-sm text-foreground font-mono">{credentialsDialog?.email}</span>
 <button type="button" onClick={() => copyToClipboard(credentialsDialog?.email, 'email')}
 className="text-muted-foreground hover:text-primary transition-colors">
 {copied === 'email' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
 </button>
 </div>
 </div>
 <div className="space-y-2">
 <Label className="text-muted-foreground text-xs uppercase tracking-wide">Password</Label>
 <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
 <span className="flex-1 text-sm text-foreground font-mono">{credentialsDialog?.password}</span>
 <button type="button" onClick={() => copyToClipboard(credentialsDialog?.password, 'pwd')}
 className="text-muted-foreground hover:text-primary transition-colors">
 {copied === 'pwd' ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
 </button>
 </div>
 </div>
 <button type="button"
 onClick={() => copyToClipboard(`Email: ${credentialsDialog?.email}\nPassword: ${credentialsDialog?.password}`, 'all')}
 className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-teal-500/30 text-primary hover:bg-primary/10 transition-colors text-sm font-medium">
 {copied === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
 {copied === 'all' ? 'Copiato!' : 'Copia tutto'}
 </button>
 <p className="text-xs text-muted-foreground text-center">Salva queste credenziali — non potrai recuperare la password in seguito.</p>
 </div>
 <DialogFooter>
 <Button onClick={() => setCredentialsDialog(null)} className="btn-primary w-full">
 Fatto
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

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
