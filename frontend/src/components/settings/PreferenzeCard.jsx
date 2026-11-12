import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Compass } from 'lucide-react';
import { DIMENSIONI_TESTO } from '@/lib/vociMenu';

const PAGINE = [
  { valore: 'dashboard', etichetta: 'Home' },
  { valore: 'deliveries', etichetta: 'Consegne' },
];

const Scelte = ({ voci, attiva, onScegli, prefisso }) => (
  <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
    {voci.map(({ valore, etichetta }) => (
      <Button key={valore} type="button" variant={attiva === valore ? 'default' : 'outline'}
        onClick={() => onScegli(valore)} data-testid={`${prefisso}-${valore}`}>
        {etichetta}
      </Button>
    ))}
  </div>
);

export default function PreferenzeCard({ settings, setSettings }) {
  const imposta = (chiave) => (valore) => setSettings((prev) => ({ ...prev, [chiave]: valore }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Compass className="w-5 h-5 text-primary" />Preferenze</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Pagina iniziale</Label>
          <Scelte voci={PAGINE} attiva={settings.pagina_iniziale} onScegli={imposta('pagina_iniziale')} prefisso="pagina-iniziale" />
        </div>
        <div className="space-y-2">
          <Label>Dimensione del testo</Label>
          <Scelte voci={DIMENSIONI_TESTO} attiva={settings.dimensione_testo} onScegli={imposta('dimensione_testo')} prefisso="testo" />
        </div>
      </CardContent>
    </Card>
  );
}
