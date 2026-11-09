import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { useDriversQuery } from '@/hooks/queries';
import { chiavi, letture } from '@/lib/api';
import { API } from '@/lib/config';
import ProfiloFattorinoDialog from '../../components/drivers/ProfiloFattorinoDialog';
import FattorinoCard from '../../components/drivers/FattorinoCard';
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

// Aprire il profilo di un fattorino. Il caricamento delle statistiche sta qui
// e non nella scheda: alla scheda basta mostrare un fattorino.
const apriProfilo = async (driver) => {
  setProfileDriver(driver);
  setProfileStats(null);
  setProfileLoading(true);
  try {
    const risposta = await queryClient.fetchQuery({
      queryKey: chiavi.statsFattorino(driver.driver_id),
      queryFn: letture.statsFattorino(driver.driver_id),
    });
    setProfileStats(risposta);
  } catch (errore) {
    console.error('Errore caricamento stats:', errore);
    toast.error('Errore caricamento statistiche');
  } finally {
    setProfileLoading(false);
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
      <FattorinoCard
        {...{
        apriProfilo,
        driver,
        handleDelete,
        handleEdit,
        handleSetDefaultDriver,
        handleToggleActive,
        index,
        user,
        vehicleLabels,
        }}
      />
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
      <ProfiloFattorinoDialog
        {...{
        handleEdit,
        profileDriver,
        profileLoading,
        profileStats,
        setProfileDriver,
        setProfileStats,
        vehicleLabels,
        }}
      />

 </Layout>
 );
}
