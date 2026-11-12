import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { ArrowDown, ArrowUp, ListOrdered, RotateCcw } from 'lucide-react';
import { PAGINE_MENU, ordinaMenu } from '@/lib/vociMenu';

export default function MenuCard({ settings, setSettings }) {
  const voci = ordinaMenu(PAGINE_MENU, settings.ordine_menu);
  const accese = settings.funzioni || {};
  const visibili = voci.filter((voce) => !voce.funzione || accese[voce.funzione] !== false);

  const sposta = (indice, verso) => {
    const percorsi = voci.map((voce) => voce.path);
    const da = percorsi.indexOf(visibili[indice].path);
    const a = percorsi.indexOf(visibili[indice + verso].path);
    [percorsi[da], percorsi[a]] = [percorsi[a], percorsi[da]];
    setSettings((prev) => ({ ...prev, ordine_menu: percorsi }));
  };

  return (
    <Card data-testid="ordine-menu">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-primary" />Ordine del menu
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!settings.ordine_menu?.length}
          onClick={() => setSettings((prev) => ({ ...prev, ordine_menu: [] }))}
          data-testid="ordine-menu-ripristina"
        >
          <RotateCcw className="w-4 h-4 mr-1" />Ripristina
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {visibili.map((voce, indice) => (
          <div key={voce.path} className="flex items-center gap-3 rounded-lg bg-secondary/30 px-3 py-2">
            <voce.icon className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{voce.label}</span>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={indice === 0}
              onClick={() => sposta(indice, -1)} aria-label={`Sposta su ${voce.label}`} data-testid={`menu-su-${voce.path.slice(1)}`}>
              <ArrowUp className="w-4 h-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={indice === visibili.length - 1}
              onClick={() => sposta(indice, 1)} aria-label={`Sposta giu ${voce.label}`} data-testid={`menu-giu-${voce.path.slice(1)}`}>
              <ArrowDown className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
