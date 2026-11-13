import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Save, Zap } from 'lucide-react';
import { OPZIONI_PULSANTE } from '@/lib/pulsanteMagico';

/** Gli extra del pulsante magico: spenti finche' la farmacia non li accende. */
export default function PulsanteMagicoCard({ settings, setSettings, onSalva, salvando }) {
  const scelte = settings.pulsante || {};
  const cambia = (chiave, acceso) => setSettings((prev) => ({
    ...prev,
    pulsante: { ...prev.pulsante, [chiave]: acceso },
  }));

  return (
    <Card data-testid="pulsante-magico-impostazioni">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-primary" />Pulsante magico</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {OPZIONI_PULSANTE.map((opzione) => (
          <div key={opzione.chiave} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 p-3">
            <div className="min-w-0">
              <p className="font-medium">{opzione.nome}</p>
              <p className="text-xs text-muted-foreground">{opzione.dove}</p>
            </div>
            <Switch
              checked={scelte[opzione.chiave] === true}
              onCheckedChange={(acceso) => cambia(opzione.chiave, acceso)}
              aria-label={opzione.nome}
              data-testid={`pulsante-${opzione.chiave}`}
            />
          </div>
        ))}
        <Button type="button" onClick={onSalva} disabled={salvando} className="w-full mt-2" data-testid="salva-pulsante">
          <Save className="w-4 h-4 mr-2" />{salvando ? 'Salvataggio...' : 'Salva'}
        </Button>
      </CardContent>
    </Card>
  );
}
