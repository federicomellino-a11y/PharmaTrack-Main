import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { SlidersHorizontal } from 'lucide-react';
import { FUNZIONI_FARMACIA } from '@/lib/funzioniFarmacia';

/* FunzioniCard: cosa la farmacia vuole vedere nel menu.

   Ogni interruttore comanda una cosa vera e sola: la voce nel menu, la pagina
   (che si chiude anche se arrivata da un segnalibro) e, per la cassa in home,
   il riquadro dei soldi. Spenta una funzione i dati restano dove sono: si
   smette di mostrarla, non si cancella niente.
*/
export default function FunzioniCard({ settings, setSettings }) {
  const funzioni = settings.funzioni || {};
  const cambia = (chiave, acceso) => setSettings((prev) => ({
    ...prev,
    funzioni: { ...prev.funzioni, [chiave]: acceso },
  }));

  return (
    <Card data-testid="funzioni-farmacia">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-primary" />Funzioni attive
        </CardTitle>
        <CardDescription>Spegni quello che non usi. I dati restano salvati.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {FUNZIONI_FARMACIA.map((funzione) => (
          <div key={funzione.chiave} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
            <p className="font-medium">{funzione.nome}</p>
            <Switch
              checked={funzioni[funzione.chiave] !== false}
              onCheckedChange={(acceso) => cambia(funzione.chiave, acceso)}
              aria-label={funzione.nome}
              data-testid={`funzione-${funzione.chiave}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
