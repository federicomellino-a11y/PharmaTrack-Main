import React from 'react';
import { Badge } from '../ui/badge';
import { Bell } from 'lucide-react';
import { BellRing } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { CardContent } from '../ui/card';
import { CardDescription } from '../ui/card';
import { CardHeader } from '../ui/card';
import { CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';

/* NotificheCard: permessi e push sul dispositivo.

   Estratto da Settings.jsx: la pagina teneva dieci schede in fila e nessuna
   si poteva leggere da sola. Riceve dallo stato della pagina solo cio' che usa.
*/
const EVENTI = [
  { chiave: 'delivery', etichetta: 'Consegne', descrizione: 'Consegna assegnata, ritirata, consegnata, annullata, vendita importata.' },
  { chiave: 'shift', etichetta: 'Turni', descrizione: 'Turno aperto, chiuso e chiusura di cassa.' },
];

export default function NotificheCard({ handleDisableRealPush, handleEnableRealPush, handleRequestPermission, notificationPermissionInfo, pushConfigured, pushLoading, pushSubscribed, pushSupported, setSettings, settings }) {
  return (
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

            <div className="rounded-lg border border-border p-4 space-y-3" data-testid="eventi-notifiche">
              <div>
                <p className="font-medium">Cosa vuoi sapere</p>
                <p className="text-xs text-muted-foreground">Spegnere una famiglia di avvisi non tocca quelli gia' ricevuti.</p>
              </div>
              {EVENTI.map(({ chiave, etichetta, descrizione }) => (
                <div key={chiave} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div>
                    <p className="font-medium">{etichetta}</p>
                    <p className="text-xs text-muted-foreground">{descrizione}</p>
                  </div>
                  <Switch
                    checked={settings.notifiche_eventi[chiave]}
                    onCheckedChange={(checked) => setSettings((prev) => ({
                      ...prev,
                      notifiche_eventi: { ...prev.notifiche_eventi, [chiave]: checked },
                    }))}
                    data-testid={`evento-${chiave}`}
                  />
                </div>
              ))}
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

  );
}
