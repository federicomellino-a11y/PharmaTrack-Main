import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useDriversQuery, usePlanQuery } from '@/hooks/queries';
import PianoCard from '../../components/settings/PianoCard';
import DatiFarmaciaCard from '../../components/settings/DatiFarmaciaCard';
import NotificheCard from '../../components/settings/NotificheCard';
import FunzioniProCard from '../../components/settings/FunzioniProCard';
import EsportaCard from '../../components/settings/EsportaCard';
import StaffCard from '../../components/StaffCard';
import { API } from '@/lib/config';
import { ensureArray, ensureObject } from '@/lib/collections';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSocket } from '../../contexts/SocketContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
import { Switch } from '../../components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Crown, Lock, MapPinned, Moon, Palette, Plug, Save, Shield, Smartphone, Sun, User } from 'lucide-react';
import { toast } from 'sonner';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { InstallAppButton } from '@/components/InstallAppButton';

const buildFormData = (user) => ({
  pharmacy_name: user?.pharmacy_name || '',
  pharmacy_address: user?.pharmacy_address || '',
  pharmacy_phone: user?.pharmacy_phone || '',
  pharmacy_lat: user?.pharmacy_lat ?? null,
  pharmacy_lng: user?.pharmacy_lng ?? null,
  default_driver_id: user?.settings?.default_driver_id || '',
});

const buildSettingsData = (user) => ({
  notifications_enabled: user?.settings?.notifications_enabled ?? true,
  sound_enabled: user?.settings?.sound_enabled ?? true,
  driver_tracking_enabled: user?.settings?.driver_tracking_enabled ?? false,
});

const permissionLabels = {
  granted: { label: 'Consentito', className: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  default: { label: 'Da autorizzare', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  denied: { label: 'Bloccato dal browser', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  unsupported: { label: 'Non supportato', className: 'bg-muted text-muted-foreground border-border' },
};

export default function SettingsPage() {
  const { user, updateProfile, logout } = useAuth();
  const { setTheme, isDark } = useTheme();
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

  const [scheda, setScheda] = useState('impostazioni');
  const [drivers, setDrivers] = useState([]);
  const [saving, setSaving] = useState(false);
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
    setSaving(true);

    const mergedSettings = {
      ...ensureObject(user?.settings),
      ...ensureObject(settings),
      default_driver_id: formData.default_driver_id || '',
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
      toast.success('Profilo farmacia salvato correttamente');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore nel salvataggio del profilo farmacia');
    } finally {
      setSaving(false);
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
            <TabsTrigger value="profilo">Profilo</TabsTrigger>
            <TabsTrigger value="impostazioni">Impostazioni</TabsTrigger>
            <TabsTrigger value="piano">Piano</TabsTrigger>
            <TabsTrigger value="integrazioni">Integrazioni</TabsTrigger>
            <TabsTrigger value="esporta">Esporta</TabsTrigger>
            <TabsTrigger value="altro">Altro</TabsTrigger>
          </TabsList>

          <TabsContent value="profilo" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-primary" />Profilo Account</CardTitle>
                <CardDescription>Informazioni del tuo account</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={user?.picture} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">{user?.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold">{user?.name}</h3>
                    <p className="text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            {user?.role !== 'staff' && <StaffCard />}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5 text-primary" />Aspetto</CardTitle>
                <CardDescription>Personalizza l'aspetto dell'applicazione</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                  <div className="flex items-center gap-3">
                    {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    <div>
                      <p className="font-medium">Tema</p>
                      <p className="text-xs text-muted-foreground">Scegli tra tema chiaro o scuro</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant={!isDark ? 'default' : 'outline'} size="sm" type="button" onClick={() => setTheme('light')} data-testid="theme-light">
                      <Sun className="w-4 h-4 mr-1" />Chiaro
                    </Button>
                    <Button variant={isDark ? 'default' : 'outline'} size="sm" type="button" onClick={() => setTheme('dark')} data-testid="theme-dark">
                      <Moon className="w-4 h-4 mr-1" />Scuro
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary" />PWA</CardTitle>
                <CardDescription>Installa PharmaTrack come app sul telefono o sul desktop</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Stato installazione</p>
                      <p className="text-xs text-muted-foreground">Accesso rapido dalla schermata home, avvio standalone e supporto offline di base.</p>
                    </div>
                    <Badge variant="outline" className={isInstalled ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : 'bg-secondary text-foreground'}>
                      {isInstalled ? 'Installata' : isInstallable ? 'Pronta da installare' : pwaSupported ? 'Disponibile' : 'Non supportata'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <InstallAppButton variant="default" size="sm" showLabel />
                    {!isInstallable && !isInstalled && (
                      <p className="text-xs text-muted-foreground">
                        Se il browser non apre il prompt, il pulsante spiega dove si trova l'installazione nel suo menu.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="impostazioni" className="space-y-6 mt-4">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Salva da qui tutte le modifiche</p>
                  <p className="text-sm text-muted-foreground">Profilo farmacia, notifiche e tracking vengono salvati insieme.</p>
                </div>
                <Button type="button" onClick={handleSubmit} disabled={saving} className="w-full sm:w-auto">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Salvataggio...' : 'Salva impostazioni'}
                </Button>
              </CardContent>
            </Card>
          <DatiFarmaciaCard
            {...{
            activeDrivers,
            formData,
            handleSubmit,
            saving,
            setFormData,
            settings,
            }}
          />
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MapPinned className="w-5 h-5 text-primary" />Geolocalizzazione</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium">Tracking fattorini</p>
                    <p className="text-xs text-muted-foreground">Lasciato disattivo finché la funzione PRO non sarà pronta</p>
                  </div>
                  <Switch checked={settings.driver_tracking_enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, driver_tracking_enabled: checked }))} />
                </div>
                <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-primary/10 border border-purple-500/30 relative">
                  <Badge className="absolute top-2 right-2 bg-purple-500/20 text-purple-400 border-purple-500/50"><Crown className="w-3 h-3 mr-1" />PRO</Badge>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center"><Lock className="w-5 h-5 text-purple-400" /></div>
                    <div>
                      <p className="font-medium">Assegnazione automatica</p>
                      <p className="text-xs text-muted-foreground">Assegna al fattorino più vicino</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Shield className="w-5 h-5 text-primary" />Informazioni</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p><strong>PharmaTrack</strong> - Gestione consegne farmaceutiche</p>
                <Separator />
                <div className="flex justify-between"><span>Versione</span><Badge variant="outline">1.1.0</Badge></div>
                <div className="flex justify-between"><span>Stato servizi</span><Badge className="bg-emerald-500/20 text-emerald-500">Operativi</Badge></div>
                <div className="flex justify-between"><span>Modalità installabile</span><Badge variant="outline">{pwaSupported ? 'Sì' : 'Limitata'}</Badge></div>
                <div className="flex justify-between"><span>Push server</span><Badge variant="outline">{pushConfigured ? 'Configurate' : 'Da configurare'}</Badge></div>
                <div className="flex justify-between"><span>Push dispositivo</span><Badge variant="outline">{pushSubscribed ? 'Attive' : 'Non attive'}</Badge></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
