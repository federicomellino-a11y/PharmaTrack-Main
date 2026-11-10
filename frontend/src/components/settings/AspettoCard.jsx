import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { InstallAppButton } from '../InstallAppButton';
import { Monitor, Moon, Palette, Smartphone, Sun } from 'lucide-react';

/* AspettoCard: come si vede l'app e come si installa sul dispositivo.

   Il tema era una riga sola (chiaro/scuro) dentro Profilo, e l'installazione
   PWA stava in Profilo pur non essendo una preferenza del profilo. Qui stanno
   insieme le due cose che riguardano il dispositivo, non l'account.
*/
const MODI = [
  { valore: 'light', etichetta: 'Chiaro', icona: Sun, testid: 'theme-light' },
  { valore: 'dark', etichetta: 'Scuro', icona: Moon, testid: 'theme-dark' },
  { valore: 'system', etichetta: 'Come il sistema', icona: Monitor, testid: 'theme-system' },
];

export default function AspettoCard({
  isInstalled,
  isInstallable,
  pwaSupported,
  setTheme,
  theme,
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5 text-primary" />Aspetto</CardTitle>
          <CardDescription>Scegli come si vede l'app su questo dispositivo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            {MODI.map(({ valore, etichetta, icona: Icona, testid }) => (
              <Button
                key={valore}
                type="button"
                variant={theme === valore ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => setTheme(valore)}
                data-testid={testid}
              >
                <Icona className="w-4 h-4 mr-2" />{etichetta}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            La scelta resta su questo dispositivo. "Come il sistema" segue la modalita' notte del telefono o del PC.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-primary" />App sul dispositivo</CardTitle>
          <CardDescription>Installala per aprirla dalla schermata home, senza passare dal browser</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Stato installazione</p>
                <p className="text-xs text-muted-foreground">Avvio standalone e supporto offline di base.</p>
              </div>
              <Badge variant="outline" className={isInstalled ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : 'bg-secondary text-foreground'}>
                {isInstalled ? 'Installata' : isInstallable ? 'Pronta da installare' : pwaSupported ? 'Disponibile' : 'Non supportata'}
              </Badge>
            </div>
            <InstallAppButton variant="default" size="sm" showLabel />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
