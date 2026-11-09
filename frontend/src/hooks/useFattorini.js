import { useCallback, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { API } from '@/lib/config';
import { chiavi, letture } from '@/lib/api';
import { ensureArray } from '@/lib/collections';
import { filtraFattorini, messaggioPiano } from '@/lib/drivers';
import { confirmAction } from '../components/ConfirmDialog';

/* Lo stato e le azioni della pagina Fattorini.

   Erano 140 righe dentro il componente: dieci useState, la creazione, la
   modifica, l'attivazione, il fattorino predefinito, l'eliminazione e il
   caricamento delle statistiche, mescolate al JSX. Qui si leggono in ordine, e
   la pagina resta un elenco di cose da disegnare.

   Le chiamate di rete sono rimaste identiche a prima, compresi i messaggi.
*/

const MODULO_VUOTO = { name: '', phone: '', email: '', password: '', vehicle_type: 'scooter' };

export default function useFattorini({ drivers, user, updateProfile, queryClient }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [credentialsDialog, setCredentialsDialog] = useState(null);
  const [copied, setCopied] = useState('');
  const [profileDriver, setProfileDriver] = useState(null);
  const [profileStats, setProfileStats] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [formData, setFormData] = useState(MODULO_VUOTO);

  const fetchDrivers = () => queryClient.invalidateQueries({ queryKey: ['drivers'] });

  const resetForm = () => {
    setEditingDriver(null);
    setFormData(MODULO_VUOTO);
    setShowPassword(false);
  };

  const openNewDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleEdit = (driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      password: '',
      vehicle_type: driver.vehicle_type,
    });
    setDialogOpen(true);
  };

  const handleSetDefaultDriver = async (driver) => {
    try {
      await updateProfile({ settings: { ...(user?.settings || {}), default_driver_id: driver.driver_id } });
      toast.success(`${driver.name} è ora il fattorino predefinito — le nuove consegne gli verranno assegnate automaticamente`);
      fetchDrivers();
    } catch {
      toast.error('Errore impostazione predefinito');
    }
  };

  const handleSubmit = async (evento) => {
    evento.preventDefault();
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
            description: 'Le nuove consegne verranno assegnate automaticamente.',
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

  const handleToggleActive = async (driver) => {
    try {
      await axios.put(`${API}/drivers/${driver.driver_id}`,
        { is_active: !driver.is_active },
        { withCredentials: true });
      toast.success(driver.is_active ? 'Fattorino disattivato' : 'Fattorino attivato');
      fetchDrivers();
    } catch {
      toast.error('Errore');
    }
  };

  const handleDelete = async (driverId) => {
    if (!(await confirmAction({
      title: 'Eliminare questo fattorino?',
      description: 'Non potra piu accedere all\'app.',
      confirmLabel: 'Elimina',
      destructive: true,
    }))) return;
    try {
      await axios.delete(`${API}/drivers/${driverId}`, { withCredentials: true });
      toast.success('Fattorino eliminato');
      fetchDrivers();
    } catch {
      toast.error('Errore eliminazione');
    }
  };

  // Aprire il profilo di un fattorino: le statistiche si chiedono qui e passano
  // dalla cache, cosi' riaprire lo stesso profilo e' immediato.
  const apriProfilo = useCallback(async (driver) => {
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
  }, [queryClient]);

  const copyToClipboard = async (testo, chiave) => {
    try {
      await navigator.clipboard.writeText(testo);
      setCopied(chiave);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      toast.error('Copia non riuscita');
    }
  };

  const chiudiProfilo = () => {
    setProfileDriver(null);
    setProfileStats(null);
  };

  const safeDrivers = ensureArray(drivers);
  const filteredDrivers = useMemo(
    () => filtraFattorini(safeDrivers, searchTerm),
    [safeDrivers, searchTerm],
  );

  return {
    searchTerm, setSearchTerm,
    dialogOpen, setDialogOpen,
    editingDriver, formData, setFormData,
    showPassword, setShowPassword,
    credentialsDialog, setCredentialsDialog,
    copied, copyToClipboard,
    profileDriver, profileStats, profileLoading, openNewDialog, apriProfilo, chiudiProfilo,
    handleEdit, handleToggleActive, handleSetDefaultDriver, handleDelete, handleSubmit,
    safeDrivers, filteredDrivers,
  };
}
