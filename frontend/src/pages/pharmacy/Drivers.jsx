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
 Copy, Check, Zap, KeyRound
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

export default function DriversPage() {
 const [drivers, setDrivers] = useState([]);
 const [loading, setLoading] = useState(true);
 const [searchTerm, setSearchTerm] = useState('');
 const [dialogOpen, setDialogOpen] = useState(false);
 const [editingDriver, setEditingDriver] = useState(null);
 const [showPassword, setShowPassword] = useState(false);
 const [credentialsDialog, setCredentialsDialog] = useState(null);
 const [copied, setCopied] = useState('');
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
 <h1 className="text-2xl font-bold text-white">Anagrafica Fattorini</h1>
 <p className="text-zinc-400">{safeDrivers.length} fattorini registrati</p>
 </div>
 <Button
 onClick={openNewDialog}
 className="btn-glow bg-teal-500 hover:bg-teal-600 text-black"
 data-testid="add-driver-btn"
 >
 <Plus className="w-4 h-4 mr-2"/>
 Nuovo Fattorino
 </Button>
 </div>

 {/* Search */}
 <div className="relative max-w-md">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"/>
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
 <Truck className="w-12 h-12 text-zinc-600 mx-auto mb-4"/>
 <p className="text-zinc-400">
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
 className={` hover:border-teal-500/30 transition-colors animate-slide-up stagger-${(index % 5) + 1}`}
 >
 <CardContent className="p-5">
 <div className="flex items-start justify-between mb-4">
 <div className="flex items-center gap-3">
 <div className={`w-10 h-10 rounded-full flex items-center justify-center ${driver.is_active ? 'bg-teal-500/10' : 'bg-zinc-700/50'}`}>
 <Truck className={`w-5 h-5 ${driver.is_active ? 'text-teal-400' : 'text-zinc-500'}`} />
 </div>
 <div>
 <h3 className="font-semibold text-white">{driver.name}</h3>
 <Badge className={driver.is_active ? 'bg-teal-500/20 text-teal-400' : 'bg-zinc-700/50 text-zinc-500'}>
 {driver.is_active ? 'Attivo' : 'Inattivo'}
 </Badge>
 </div>
 </div>
 <div className="flex gap-1">
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleEdit(driver)}
 className="h-8 w-8 text-zinc-400 hover:text-white"
 data-testid={`edit-driver-${driver.driver_id}`}
 >
 <Pencil className="w-4 h-4"/>
 </Button>
 <Button
 variant="ghost"
 size="icon"
 onClick={() => handleDelete(driver.driver_id)}
 className="h-8 w-8 text-zinc-400 hover:text-red-400"
 data-testid={`delete-driver-${driver.driver_id}`}
 >
 <Trash2 className="w-4 h-4"/>
 </Button>
 </div>
 </div>
 <div className="space-y-2 text-sm">
 <div className="flex items-center gap-2 text-zinc-400">
 <Phone className="w-4 h-4"/>
 <span>{driver.phone}</span>
 </div>
 <div className="flex items-center gap-2 text-zinc-400">
 <Mail className="w-4 h-4"/>
 <span className="truncate">{driver.email}</span>
 </div>
 <div className="flex items-center gap-2 text-zinc-400">
 <Truck className="w-4 h-4"/>
 <span>{vehicleLabels[driver.vehicle_type] || driver.vehicle_type}</span>
 </div>
 </div>
 <div className="mt-4 pt-4 border-t flex items-center justify-between">
 <span className="text-sm text-zinc-500">Stato account</span>
 <Switch
 checked={driver.is_active}
 onCheckedChange={() => handleToggleActive(driver)}
 data-testid={`toggle-driver-${driver.driver_id}`}
 />
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
 <DialogTitle className="text-white">
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
 className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
 >
 {showPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
 </button>
 </div>
 <Button
 type="button"
 variant="outline"
 size="sm"
 className="shrink-0 gap-1 border-teal-500/40 text-teal-400 hover:bg-teal-500/10"
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
 className="bg-teal-500 hover:bg-teal-600 text-black"
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
 <DialogTitle className="flex items-center gap-2 text-white">
 <KeyRound className="w-5 h-5 text-teal-400" />
 Fattorino creato!
 </DialogTitle>
 </DialogHeader>
 <div className="space-y-4 py-2">
 <p className="text-sm text-zinc-400">
 Condividi queste credenziali con <span className="text-white font-semibold">{credentialsDialog?.name}</span> per permettergli di accedere all'app.
 </p>
 <div className="space-y-2">
 <Label className="text-zinc-400 text-xs uppercase tracking-wide">Email</Label>
 <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
 <span className="flex-1 text-sm text-white font-mono">{credentialsDialog?.email}</span>
 <button type="button" onClick={() => copyToClipboard(credentialsDialog?.email, 'email')}
 className="text-zinc-400 hover:text-teal-400 transition-colors">
 {copied === 'email' ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
 </button>
 </div>
 </div>
 <div className="space-y-2">
 <Label className="text-zinc-400 text-xs uppercase tracking-wide">Password</Label>
 <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
 <span className="flex-1 text-sm text-white font-mono">{credentialsDialog?.password}</span>
 <button type="button" onClick={() => copyToClipboard(credentialsDialog?.password, 'pwd')}
 className="text-zinc-400 hover:text-teal-400 transition-colors">
 {copied === 'pwd' ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
 </button>
 </div>
 </div>
 <button type="button"
 onClick={() => copyToClipboard(`Email: ${credentialsDialog?.email}\nPassword: ${credentialsDialog?.password}`, 'all')}
 className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-teal-500/30 text-teal-400 hover:bg-teal-500/10 transition-colors text-sm font-medium">
 {copied === 'all' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
 {copied === 'all' ? 'Copiato!' : 'Copia tutto'}
 </button>
 <p className="text-xs text-zinc-500 text-center">Salva queste credenziali — non potrai recuperare la password in seguito.</p>
 </div>
 <DialogFooter>
 <Button onClick={() => setCredentialsDialog(null)} className="bg-teal-500 hover:bg-teal-600 text-black w-full">
 Fatto
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>

 </Layout>
 );
}
