import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { API } from '@/lib/config';
import { ensureArray, ensureObject } from '@/lib/collections';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSocket } from '../../contexts/SocketContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Separator } from '../../components/ui/separator';
import { Switch } from '../../components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Bell,
  BellRing,
  Building2,
  Copy,
  Crown,
  Download,
  Key,
  Lock,
  MapPinned,
  Moon,
  Palette,
  RefreshCw,
  Save,
  Shield,
  Smartphone,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePWAInstall } from '@/hooks/usePWAInstall';

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
  const { isInstallable, isInstalled, isSupported: pwaSupported, install } = usePWAInstall();

  // Load API token on mount
  useEffect(() => {
    axios.get(`${API}/auth/token`, { withCredentials: true })
      .then(res => setApiToken(res.data))
      .catch(() => setApiToken(null));
  }, []);

  const handleGenerateToken = async () => {
    setApiTokenLoading(true);
    try {
      const res = await axios.post(`${API}/auth/token`, {}, { withCredentials: true });
      setApiToken(res.data);
      setApiTokenVisible(true);
      toast.success('Token API generato');
    } catch {
      toast.error('Errore nella generazione del token');
    } finally {
      setApiTokenLoading(false);
    }
  };

  const handleRevokeToken = async () => {
    setApiTokenLoading(true);
    try {
      await axios.delete(`${API}/auth/token`, { withCredentials: true });
      setApiToken(null);
      setApiTokenVisible(false);
      toast.success('Token API revocato');
    } catch {
      toast.error('Errore nella revoca del token');
    } finally {
      setApiTokenLoading(false);
    }
  };

  const handleCopyToken = () => {
    if (apiToken?.token) {
      navigator.clipboard.writeText(apiToken.token);
      toast.success('Token copiato negli appunti');
    }
  };

  const [drivers, setDrivers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [apiToken, setApiToken] = useState(null);
  const [apiTokenLoading, setApiTokenLoading] = useState(false);
  const [apiTokenVisible, setApiTokenVisible] = useState(false);
  const [installingPwa, setInstallingPwa] = useState(false);
  const [formData, setFormData] = useState(() => buildFormData(user));
  const [settings, setSettings] = useState(() => buildSettingsData(user));

  useEffect(() => {
    setFormData(buildFormData(user));
    setSettings(buildSettingsData(user));
  }, [user]);

  useEffect(() => {
    axios.get(`${API}/drivers`, { withCredentials: true })
      .then((res) => setDrivers(ensureArray(res.data)))
      .catch(() => {
        setDrivers([]);
      });
  }, []);

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


  const handleInstallPwa = async () => {
    setInstallingPwa(true);
    try {
      const result = await install();
      if (result?.outcome === 'accepted') {
        toast.success('Installazione avviata');
      } else if (result?.outcome === 'dismissed') {
        toast.message('Installazione annullata');
      } else {
        toast.message('Prompt di installazione non disponibile su questo dispositivo');
      }
    } finally {
      setInstallingPwa(false);
    }
  };

  return (
    <Layout title="Impostazioni">
      <div className="max-w-2xl space-y-6" data-testid="settings-page">
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
            <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" />Dati Farmacia</CardTitle>
            <CardDescription>Configura le informazioni della tua farmacia</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nome Farmacia</Label>
                <Input
                  value={formData.pharmacy_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, pharmacy_name: e.target.value }))}
                  placeholder="Es. Farmacia Centrale"
                />
              </div>

              <div>
                <AddressAutocomplete
                  label="Indirizzo Farmacia"
                  value={formData.pharmacy_address}
                  onChange={(value) => setFormData((prev) => ({ ...prev, pharmacy_address: value, pharmacy_lat: null, pharmacy_lng: null }))}
                  onAddressSelect={(selection) => setFormData((prev) => ({
                    ...prev,
                    pharmacy_address: selection.address,
                    pharmacy_lat: selection.lat,
                    pharmacy_lng: selection.lng,
                  }))}
                  placeholder="Es. Via Roma 123, Milano"
                  id="settings-pharmacy-address"
                />
                {formData.pharmacy_lat && formData.pharmacy_lng && (
                  <p className="text-xs text-emerald-600 mt-2">Indirizzo farmacia verificato sulla mappa</p>
                )}
              </div>

              <div>
                <Label>Telefono Farmacia</Label>
                <Input
                  value={formData.pharmacy_phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, pharmacy_phone: e.target.value }))}
                  placeholder="Es. +39 02 1234567"
                />
              </div>

              <Separator />

              <div>
                <Label>Fattorino Predefinito</Label>
                <Select
                  value={formData.default_driver_id || 'none'}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, default_driver_id: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger><SelectValue placeholder="Nessun fattorino predefinito" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {activeDrivers.map((driver) => (
                      <SelectItem key={driver.driver_id} value={driver.driver_id}>{driver.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Questo fattorino sarà suggerito automaticamente per le nuove consegne</p>
              </div>

              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Salvataggio...' : 'Salva Modifiche'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5 text-primary" />Notifiche</CardTitle>
            <CardDescription>Attiva o disattiva le notifiche push sul dispositivo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 gap-3">
              <div>
                <p className="font-medium">Notifiche browser</p>
                <p className="text-xs text-muted-foreground">Ricevi notifiche push sul dispositivo</p>
              </div>
              <Switch checked={settings.notifications_enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, notifications_enabled: checked }))} />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 gap-3">
              <div>
                <p className="font-medium">Suoni notifiche</p>
                <p className="text-xs text-muted-foreground">Riproduci un suono quando arriva un nuovo evento</p>
              </div>
              <Switch checked={settings.sound_enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, sound_enabled: checked }))} />
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Stato permesso notifiche</p>
                  <p className="text-xs text-muted-foreground">Se bloccato, va riabilitato dalle impostazioni del browser.</p>
                </div>
                <Badge variant="outline" className={notificationPermissionInfo.className}>{notificationPermissionInfo.label}</Badge>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div>
                  <p className="font-medium">Push reali via service worker</p>
                  <p className="text-xs text-muted-foreground">Funzionano anche con app in background se browser, PWA e backend sono configurati.</p>
                </div>
                <Badge variant="outline" className={pushSubscribed ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : pushConfigured ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-muted text-muted-foreground border-border'}>
                  {!pushSupported ? 'Non supportate' : pushSubscribed ? 'Attive' : pushConfigured ? 'Da attivare' : 'Backend non configurato'}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleRequestPermission}>
                  <BellRing className="w-4 h-4 mr-2" />Abilita permesso
                </Button>
                <Button type="button" variant="outline" onClick={handleEnableRealPush} disabled={pushLoading || !pushSupported || !pushConfigured}>
                  <Bell className="w-4 h-4 mr-2" />{pushLoading ? 'Attivazione...' : 'Attiva push reali'}
                </Button>
                <Button type="button" variant="outline" onClick={handleDisableRealPush} disabled={pushLoading || !pushSubscribed}>
                  <Bell className="w-4 h-4 mr-2" />Disattiva push
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

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleInstallPwa} disabled={!isInstallable || installingPwa}>
                  <Download className="w-4 h-4 mr-2" />
                  {installingPwa ? 'Preparazione...' : isInstalled ? 'App già installata' : 'Installa app'}
                </Button>
                {!isInstallable && !isInstalled && (
                  <p className="text-xs text-muted-foreground self-center">Su iPhone usa Condividi → “Aggiungi a Home”.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

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

        <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Crown className="w-5 h-5 text-purple-400" />Funzioni PRO</CardTitle>
            <CardDescription>Funzionalità avanzate in arrivo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {[
                { title: 'Assegnazione automatica', desc: 'Assegna al fattorino più vicino' },
                { title: 'Ottimizzazione percorsi', desc: 'Calcola il percorso più efficiente' },
                { title: 'Report avanzati', desc: 'Analisi dettagliate con export' },
                { title: 'Multi-farmacia', desc: 'Gestisci più sedi' },
                { title: 'API esterne', desc: 'Integra con altri software' },
              ].map((feature) => (
                <div key={feature.title} className="flex items-center gap-3 p-3 rounded-lg bg-background/50">
                  <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center"><Lock className="w-4 h-4 text-purple-400" /></div>
                  <div>
                    <p className="font-medium text-sm">{feature.title}</p>
                    <p className="text-xs text-muted-foreground">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-center text-muted-foreground mt-4">Queste funzioni saranno disponibili presto!</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              Token API
            </CardTitle>
            <CardDescription>Token Bearer per integrazioni esterne (Winfarm, ecc.)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {apiToken ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-xs bg-muted rounded px-3 py-2 truncate select-all">
                    {apiTokenVisible ? apiToken.token : '•'.repeat(40)}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setApiTokenVisible(v => !v)} title={apiTokenVisible ? 'Nascondi' : 'Mostra'}>
                    <Key className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleCopyToken} title="Copia token">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Generato: {apiToken.created_at ? new Date(apiToken.created_at).toLocaleString('it-IT') : '—'}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleGenerateToken} disabled={apiTokenLoading}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Rigenera
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleRevokeToken} disabled={apiTokenLoading}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Revoca
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Usa come header <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;token&gt;</code>
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Nessun token API attivo.</p>
                <Button onClick={handleGenerateToken} disabled={apiTokenLoading} size="sm">
                  <Key className="w-4 h-4 mr-2" />
                  {apiTokenLoading ? 'Generazione…' : 'Genera token API'}
                </Button>
              </div>
            )}
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
      </div>
    </Layout>
  );
}
