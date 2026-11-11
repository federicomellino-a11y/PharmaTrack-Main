import React from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

/* NotificheCard: un solo interruttore per la domanda vera ("il telefono mi
   avvisa o no?") e sotto, in parole normali, cosa arriva e in quali ore
   conviene tacere.

   Prima qui c'erano quattro comandi per la stessa cosa (permesso del browser,
   "push reali via service worker", "attiva push", "disattiva push"): chi legge
   non sapeva quale toccare. L'interruttore fa tutto: chiede il permesso,
   registra il dispositivo e spegne tutto quando lo si chiude.

   Le notifiche NON sono solo del telefono: arrivano anche sul computer, dove
   la farmacia lavora al banco. Per questo le diciture non nominano nessun
   dispositivo: vale quello che si sta usando in quel momento.
*/
const EVENTI = [
  { chiave: 'delivery', etichetta: 'Consegne', descrizione: 'Consegna assegnata, ritirata, consegnata, annullata, vendita importata.' },
  { chiave: 'shift', etichetta: 'Turni', descrizione: 'Turno aperto, chiuso e chiusura di cassa.' },
  { chiave: 'message', etichetta: 'Messaggi', descrizione: 'Messaggi in chat dai fattorini.' },
];

// Il messaggio sotto l'interruttore: dice sempre la verita' di questo
// dispositivo, senza parole tecniche.
export const statoNotifiche = ({ attive, disponibili, permesso }) => {
  if (!disponibili) return 'Questo dispositivo non permette le notifiche.';
  if (permesso === 'denied') return 'Il browser le ha bloccate: tocca il lucchetto accanto all\u2019indirizzo e scegli Consenti.';
  if (attive) return 'Ti avvisiamo anche con l\u2019app chiusa, su questo dispositivo.';
  return 'Spente: gli avvisi restano dentro l\u2019app.';
};

export default function NotificheCard({
  attive = false,
  disponibili = true,
  inCorso = false,
  onCambiaNotifiche,
  permesso = 'default',
  setSettings,
  settings,
}) {
  const cambiaEvento = (chiave, acceso) => setSettings((prev) => ({
    ...prev,
    notifiche_eventi: { ...prev.notifiche_eventi, [chiave]: acceso },
  }));
  const silenzio = settings.silenzio_attivo === true;
  const bloccate = permesso === 'denied' || !disponibili;
  const messaggio = statoNotifiche({ attive, disponibili, permesso });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {attive ? <Bell className="w-5 h-5 text-primary" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
          Notifiche
        </CardTitle>
        <CardDescription>Se arrivano gli avvisi, di cosa e in quali ore</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3 rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Ricevi le notifiche</p>
            <p className={`text-xs ${permesso === 'denied' ? 'text-destructive' : 'text-muted-foreground'}`} data-testid="stato-notifiche">
              {inCorso ? 'Un attimo…' : messaggio}
            </p>
          </div>
          <Switch
            checked={attive}
            disabled={bloccate || inCorso}
            onCheckedChange={(acceso) => onCambiaNotifiche?.(acceso)}
            aria-label="Ricevi le notifiche"
            data-testid="notifiche-interruttore"
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
          <div>
            <p className="font-medium">Suono</p>
            <p className="text-xs text-muted-foreground">Un suono quando arriva un avviso</p>
          </div>
          <Switch checked={settings.sound_enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, sound_enabled: checked }))} data-testid="suono-notifiche" />
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
                In queste ore non arriva niente. Gli avvisi restano dentro l&apos;app: aprendola li trovi.
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
      </CardContent>
    </Card>
  );
}
