import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useDriversQuery, usePlanQuery } from '@/hooks/queries';
import PianoCard from '../../components/settings/PianoCard';
import DatiFarmaciaCard from '../../components/settings/DatiFarmaciaCard';
import NotificheCard from '../../components/settings/NotificheCard';
import FunzioniProCard from '../../components/settings/FunzioniProCard';
import EsportaCard from '../../components/settings/EsportaCard';
import AspettoCard from '../../components/settings/AspettoCard';
import AccountCard from '../../components/settings/AccountCard';
import OrariConsegnaCard from '../../components/settings/OrariConsegnaCard';
import FunzioniCard from '../../components/settings/FunzioniCard';
import { FASCE_PREDEFINITE, FASCIA_PRIMA, normalizzaFasce } from '../../lib/fasce';
import { funzioniDellaFarmacia } from '../../lib/funzioniFarmacia';
import { giorniConsegnati, taglioOrdini } from '../../lib/giorniConsegna';
import { API } from '@/lib/config';
import { ensureArray, ensureObject } from '@/lib/collections';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSocket } from '../../contexts/SocketContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Compass, Plug, Save } from 'lucide-react';
import { toast } from 'sonner';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/* Le schede di Impostazioni: quello che si configura, diviso per il momento in
   cui lo si cerca. "Farmacia" e' come lavora la farmacia, "Aspetto" e
   "Account" riguardano il dispositivo e la persona, "Piano" cosa e' compreso.

   Regola presa guardando la sezione vecchia: qui dentro non entra niente che
   non cambi davvero qualcosa. La spia del tracking e la promozione
   "assegnazione automatica" sono state tolte perche' non comandavano nulla.
*/
const SOGLIA_DEFAULT = 45;

const buildFormData = (user) => ({
  pharmacy_name: user?.pharmacy_name || '',
  pharmacy_address: user?.pharmacy_address || '',
  pharmacy_phone: user?.pharmacy_phone || '',
  pharmacy_lat: user?.pharmacy_lat ?? null,
  pharmacy_lng: user?.pharmacy_lng ?? null,
  default_driver_id: user?.settings?.default_driver_id || '',
});

// giorni_pazienti_fermi resta una stringa finche' si edita, cosi' il campo non
// si svuota a meta' battitura: diventa numero solo al salvataggio.
const buildFasce = (salvate) => {
  const elenco = Array.isArray(salvate.fasce) && salvate.fasce.length ? salvate.fasce : FASCE_PREDEFINITE;
  // Copia: la forma di modifica non deve scrivere dentro le impostazioni salvate.
  return elenco
    .filter((fascia) => fascia && fascia.da && fascia.a)
    .map((fascia) => ({ etichetta: fascia.etichetta || '', da: fascia.da, a: fascia.a }));
};

const buildSettingsData = (user) => {
  const salvate = ensureObject(user?.settings);
  const eventi = ensureObject(salvate.notifiche_eventi);
  const fasce = buildFasce(salvate);
  return {
    notifications_enabled: salvate.notifications_enabled ?? true,
    sound_enabled: salvate.sound_enabled ?? true,
    giorni_pazienti_fermi: String(salvate.giorni_pazienti_fermi ?? SOGLIA_DEFAULT),
    notifiche_eventi: {
      delivery: eventi.delivery !== false,
      shift: eventi.shift !== false,
      message: eventi.message !== false,
    },
    silenzio_attivo: salvate.silenzio_attivo === true,
    silenzio_da: salvate.silenzio_da || '21:30',
    silenzio_a: salvate.silenzio_a || '07:30',
    fasce: fasce.length ? fasce : buildFasce({}),
    fascia_predefinita: salvate.fascia_predefinita || FASCIA_PRIMA.valore,
    giorni_consegna: giorniConsegnati(salvate),
    taglio_ordini: taglioOrdini(salvate),
    pagina_iniziale: salvate.pagina_iniziale === 'deliveries' ? 'deliveries' : 'dashboard',
    funzioni: funzioniDellaFarmacia({ settings: salvate }),
  };
};

const sogliaValida = (valore) => {
  const numero = Number.parseInt(valore, 10);
  if (Number.isNaN(numero) || numero < 7 || numero > 365) return SOGLIA_DEFAULT;
  return numero;
};

const permissionLabels = {
  granted: { label: 'Consentito', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  default: { label: 'Da autorizzare', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  denied: { label: 'Bloccato dal browser', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  unsupported: { label: 'Non supportato', className: 'bg-muted text-muted-foreground border-border' },
};

export default function SettingsPage() {
  const { user, updateProfile, logout } = useAuth();
  const { setTheme, theme } = useTheme();
  const {
    notificationPermission,
    requestBrowserNotificationPermission,
    pushSupported,
    pushConfigured,
    pushSubscribed,
    pushLoading,
    enablePushNotifications,
    disablePushNotifications,
  } = useSocket();
  const { isInstallable, isInstalled, isSupported: pwaSupported } = usePWAInstall();

  const [scheda, setScheda] = useState('farmacia');
  const [drivers, setDrivers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [formData, setFormData] = useState(() => buildFormData(user));
  const [settings, setSettings] = useState(() => buildSettingsData(user));

  useEffect(() => {
    setFormData(buildFormData(user));
    setSettings(buildSettingsData(user));
  }, [user]);

  const { data: driversQuery = [] } = useDriversQuery();
  useEffect(() => {
    setDrivers(ensureArray(driversQuery));
  }, [driversQuery]);

  const activeDrivers = useMemo(
    () => ensureArray(drivers).filter((driver) => driver?.is_active),
    [drivers],
  );

  const notificationPermissionInfo = permissionLabels[notificationPermission] || permissionLabels.unsupported;

  const handleSubmit = async (event) => {
    event?.preventDefault?.();

    // Le fasce si controllano qui e non nel server: il banco deve leggere
    // l'errore mentre e' ancora nella scheda che sta compilando.
    const controlloFasce = normalizzaFasce(settings.fasce);
    if (!controlloFasce.ok) {
      setScheda('consegne');
      toast.error(controlloFasce.errore);
      return;
    }

    setSaving(true);

    const mergedSettings = {
      ...ensureObject(user?.settings),
      ...ensureObject(settings),
      giorni_pazienti_fermi: sogliaValida(settings.giorni_pazienti_fermi),
      default_driver_id: formData.default_driver_id || '',
      fasce: controlloFasce.fasce,
      giorni_consegna: giorniConsegnati(settings),
      taglio_ordini: taglioOrdini(settings),
    };

    const payload = {
      ...formData,
      pharmacy_lat: formData.pharmacy_lat ?? null,
      pharmacy_lng: formData.pharmacy_lng ?? null,
      settings: mergedSettings,
    };

    try {
      const updatedUser = await updateProfile(payload);
      setFormData(buildFormData(updatedUser));
      setSettings(buildSettingsData(updatedUser));
      toast.success('Impostazioni salvate');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore nel salvataggio delle impostazioni');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveName = async (nome) => {
    setSalvandoNome(true);
    try {
      const updatedUser = await updateProfile({ name: nome });
      setFormData(buildFormData(updatedUser));
      setSettings(buildSettingsData(updatedUser));
      toast.success('Nome aggiornato');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Non sono riuscito a salvare il nome');
    } finally {
      setSalvandoNome(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt('Per confermare scrivi ELIMINA');
    if (confirmation !== 'ELIMINA') return;

    setDeletingAccount(true);
    try {
      await axios.delete(`${API}/auth/delete-account`, { withCredentials: true });
      toast.success('Account eliminato');
      await logout();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore eliminazione account');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleRequestPermission = async () => {
    const permission = await requestBrowserNotificationPermission();
    if (permission === 'granted') {
      toast.success('Permesso notifiche attivato');
      return;
    }
    if (permission === 'denied') {
      toast.error('Permesso notifiche bloccato: abilitalo dalle impostazioni del browser');
      return;
    }
    toast.message('Richiesta permesso notifiche annullata');
  };

  const handleEnableRealPush = async () => {
    const result = await enablePushNotifications();
    if (result?.ok) {
      toast.success('Push reali attivate sul dispositivo');
      return;
    }
    if (result?.reason === 'push_not_configured') {
      toast.error('Push server non configurate sul backend');
      return;
    }
    if (result?.reason === 'permission_denied') {
      toast.error('Permesso notifiche negato dal browser');
      return;
    }
    if (result?.reason === 'unsupported') {
      toast.error('Questo browser non supporta le push web');
      return;
    }
    toast.error(typeof result?.reason === 'string' ? result.reason : 'Attivazione push non riuscita');
  };

  const handleDisableRealPush = async () => {
    const result = await disablePushNotifications();
    if (result?.ok) {
      toast.success('Push reali disattivate su questo dispositivo');
      return;
    }
    toast.error(typeof result?.reason === 'string' ? result.reason : 'Disattivazione push non riuscita');
  };

  const { data: piano } = usePlanQuery();
  const limiti = piano?.limiti || {};
  const uso = piano?.uso || {};
  const provaFinita = Boolean(piano?.scaduto);
  const vicinoAlTetto =
    (limiti.max_consegne_mese && (uso.consegne_mese || 0) >= limiti.max_consegne_mese * 0.9) ||
    (limiti.max_fattorini && (uso.fattorini || 0) >= limiti.max_fattorini);

  return (
    <Layout title="Impostazioni">
      <div className="max-w-2xl space-y-6" data-testid="settings-page">
        <Tabs value={scheda} onValueChange={setScheda}>
          <TabsList className="w-full justify-start overflow-x-auto" data-testid="settings-tabs">
            <TabsTrigger value="farmacia">Farmacia</TabsTrigger>
            <TabsTrigger value="consegne">Consegne</TabsTrigger>
            <TabsTrigger value="notifiche">Notifiche</TabsTrigger>
            <TabsTrigger value="aspetto">Aspetto</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="piano">Piano</TabsTrigger>
            <TabsTrigger value="integrazioni">Integrazioni</TabsTrigger>
            <TabsTrigger value="esporta">Esporta</TabsTrigger>
            <TabsTrigger value="altro">Altro</TabsTrigger>
          </TabsList>

          <TabsContent value="farmacia" className="space-y-6 mt-4">
            <DatiFarmaciaCard
              {...{
                activeDrivers,
                formData,
                handleSubmit,
                saving,
                setFormData,
                setSettings,
                settings,
              }}
            />
            <FunzioniCard settings={settings} setSettings={setSettings} />
            <p className="text-xs text-muted-foreground">
              Indirizzo e telefono compaiono al fattorino e sulle stampe: se cambiano, si cambiano qui.
            </p>
          </TabsContent>

          <TabsContent value="consegne" className="space-y-6 mt-4">
            <OrariConsegnaCard
              onSalva={handleSubmit}
              saving={saving}
              setSettings={setSettings}
              settings={settings}
            />
            <p className="text-xs text-muted-foreground">
              Il pulsante &quot;Salva orari&quot; salva anche il resto della farmacia: e&apos; una sola scheda da
              tenere in ordine, non due che si sovrascrivono.
            </p>
          </TabsContent>

          <TabsContent value="notifiche" className="space-y-6 mt-4">
            <NotificheCard
              {...{
                handleDisableRealPush,
                handleEnableRealPush,
                handleRequestPermission,
                notificationPermissionInfo,
                pushConfigured,
                pushLoading,
                pushSubscribed,
                pushSupported,
                setSettings,
                settings,
              }}
            />
            <Button type="button" onClick={handleSubmit} disabled={saving} className="w-full">
              {saving ? 'Salvataggio...' : 'Salva le preferenze di notifica'}
            </Button>
          </TabsContent>

          <TabsContent value="aspetto" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-primary" />Dove riparte l&apos;app
                </CardTitle>
                <CardDescription>La prima pagina che trovi aprendo PharmaTrack dopo l&apos;accesso</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { valore: 'dashboard', etichetta: 'La home', descrizione: 'Consegne di oggi, cassa e mappa' },
                    { valore: 'deliveries', etichetta: 'Le consegne', descrizione: 'Direttamente la lista da lavorare' },
                  ].map(({ valore, etichetta, descrizione }) => (
                    <Button
                      key={valore}
                      type="button"
                      variant={settings.pagina_iniziale === valore ? 'default' : 'outline'}
                      className="h-auto flex-col items-start gap-0.5 py-3"
                      onClick={() => setSettings((prev) => ({ ...prev, pagina_iniziale: valore }))}
                      data-testid={`pagina-iniziale-${valore}`}
                    >
                      <span className="font-semibold">{etichetta}</span>
                      <span className="text-xs font-normal opacity-80">{descrizione}</span>
                    </Button>
                  ))}
                </div>
                <Button type="button" onClick={handleSubmit} disabled={saving} data-testid="salva-avvio">
                  <Save className="w-4 h-4 mr-2" />{saving ? 'Salvataggio...' : 'Salva la pagina di avvio'}
                </Button>
              </CardContent>
            </Card>
            <AspettoCard
              isInstallable={isInstallable}
              isInstalled={isInstalled}
              pwaSupported={pwaSupported}
              setTheme={setTheme}
              theme={theme}
            />
          </TabsContent>

          <TabsContent value="account" className="space-y-6 mt-4">
            <AccountCard onSaveName={handleSaveName} salvandoNome={salvandoNome} user={user} />
          </TabsContent>

          <TabsContent value="piano" className="space-y-6 mt-4">
            <PianoCard
              {...{
                limiti,
                piano,
                provaFinita,
                uso,
                vicinoAlTetto,
              }}
            />
            <FunzioniProCard piano={piano} />
          </TabsContent>

          <TabsContent value="integrazioni" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Plug className="w-5 h-5 text-primary" />Integrazioni</CardTitle>
                <CardDescription>Winfarm, pulsante magico, Dock e import delle vendite</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Le integrazioni hanno una pagina loro perché sono istruzioni da seguire al computer:
                  qui c&apos;è la porta d&apos;ingresso, per non doverla cercare nel menu.
                </p>
                <Button asChild variant="outline" data-testid="apri-integrazioni">
                  <Link to="/integrations">Apri le integrazioni</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="esporta" className="space-y-6 mt-4">
            <EsportaCard piano={piano} />
          </TabsContent>

          <TabsContent value="altro" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">PharmaTrack</CardTitle>
                <CardDescription>Versione 1.1.0 · consegne e pazienti della farmacia</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>
                  Se qualcosa non torna, scrivi a{' '}
                  <a className="underline" href="mailto:assistenza@pharmatrack.it">assistenza@pharmatrack.it</a>{' '}
                  raccontando cosa stavi facendo.
                </p>
              </CardContent>
            </Card>
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Zona pericolosa</CardTitle>
                <CardDescription>Elimina account, iscrizione e dati collegati della farmacia.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">Verranno rimossi clienti, consegne, fattorini, messaggi e sessioni associate.</p>
                <Button type="button" variant="destructive" onClick={handleDeleteAccount} disabled={deletingAccount}>
                  {deletingAccount ? 'Eliminazione...' : 'Elimina account'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
