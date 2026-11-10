import React from 'react';
import { Badge } from '../ui/badge';
import { Bell } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

/* NotificheCard: cosa arriva, come arriva e quando stare zitti.

   Tre livelli, dal piu' esterno al piu' interno: il permesso del browser, le
   famiglie di avvisi che interessano alla farmacia, e le ore in cui il
   telefono non deve suonare. Il silenzio vale per le push: la campanella
   dentro l'app resta, cosi' aprendo si sa cosa e' successo.
*/
const EVENTI = [
  { chiave: 'delivery', etichetta: 'Consegne', descrizione: 'Consegna assegnata, ritirata, consegnata, annullata, vendita importata.' },
  { chiave: 'shift', etichetta: 'Turni', descrizione: 'Turno aperto, chiuso e chiusura di cassa.' },
  { chiave: 'message', etichetta: 'Messaggi', descrizione: 'Messaggi in chat dai fattorini.' },
];

export default function NotificheCard({
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
}) {
  const cambiaEvento = (chiave, acceso) => setSettings((prev) => ({
    ...prev,
    notifiche_eventi: { ...prev.notifiche_eventi, [chiave]: acceso },
  }));
  const silenzio = settings.silenzio_attivo === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5 text-primary" />Notifiche</CardTitle>
        <CardDescription>Cosa arriva, dove arriva e in quali ore conviene tacere</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Notifiche browser</p>
            <p className="text-xs text-muted-foreground">Ricevi notifiche push sul dispositivo</p>
          </div>
          <Switch checked={settings.notifications_enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, notifications_enabled: checked }))} />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Suoni notifiche</p>
            <p className="text-xs text-muted-foreground">Riproduci un suono quando arriva un nuovo evento</p>
          </div>
          <Switch checked={settings.sound_enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, sound_enabled: checked }))} />
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4" data-testid="eventi-notifiche">
          <div>
            <p className="font-medium">Cosa vuoi sapere</p>
            <p className="text-xs text-muted-foreground">Spegnere una famiglia di avvisi non tocca quelli gia&apos; ricevuti.</p>
          </div>
          {EVENTI.map(({ chiave, etichetta, descrizione }) => (
            <div key={chiave} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div>
                <p className="font-medium">{etichetta}</p>
                <p className="text-xs text-muted-foreground">{descrizione}</p>
              </div>
              <Switch
                checked={settings.notifiche_eventi[chiave] !== false}
                onCheckedChange={(acceso) => cambiaEvento(chiave, acceso)}
                data-testid={`evento-${chiave}`}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4" data-testid="orario-silenzio">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Non disturbare</p>
              <p className="text-xs text-muted-foreground">
                In queste ore il telefono non suona. Gli avvisi restano dentro l&apos;app: aprendola li trovi.
              </p>
            </div>
            <Switch
              checked={silenzio}
              onCheckedChange={(acceso) => setSettings((prev) => ({ ...prev, silenzio_attivo: acceso }))}
              data-testid="silenzio-attivo"
            />
          </div>
          {silenzio && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Dalle</Label>
                <Input
                  type="time"
                  value={settings.silenzio_da || '21:30'}
                  onChange={(e) => setSettings((prev) => ({ ...prev, silenzio_da: e.target.value }))}
                  data-testid="silenzio-da"
                />
              </div>
              <div>
                <Label className="text-xs">Alle</Label>
                <Input
                  type="time"
                  value={settings.silenzio_a || '07:30'}
                  onChange={(e) => setSettings((prev) => ({ ...prev, silenzio_a: e.target.value }))}
                  data-testid="silenzio-a"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4">
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
              {!pushSupported ? 'Non supportate' : pushSubscribed ? 'Attive' : pushConfigured ? 'Pronte' : 'Da configurare'}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <Button type="button" variant="outline" onClick={handleRequestPermission} disabled={notificationPermissionInfo.label === 'Consentito'}>
              Chiedi permesso
            </Button>
            <Button type="button" variant="outline" onClick={handleEnableRealPush} disabled={pushLoading || pushSubscribed}>
              Attiva push
            </Button>
            <Button type="button" variant="outline" onClick={handleDisableRealPush} disabled={pushLoading || !pushSubscribed}>
              Disattiva push
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
