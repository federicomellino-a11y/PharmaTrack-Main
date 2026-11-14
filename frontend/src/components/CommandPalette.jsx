import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from './ui/command';
import {
  Search, Package, Truck, Users, MapPin, Plus, UserPlus, ArrowRight, Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { navVisibili } from '@/lib/vociMenu';
import { cercaOvunque } from '@/lib/ricercaUniversale';
import { ensureArray } from '@/lib/collections';
import {
  useCustomersQuery, useDeliveriesQuery, useDriversQuery,
} from '@/hooks/queries';

/* "Vai a / Cerca": una casella sola per aprire una pagina, trovare un
   cliente, una consegna, un fattorino o un indirizzo.

   Le pagine sono quelle del menu visibile a questa farmacia: una funzione
   spenta non compare qui, e la scheda di una consegna si apre solo dove la
   persona ha gia' accesso. Gli elenchi si leggono dagli stessi hook delle
   pagine, cosi' la ricerca non e' una seconda verita' sui dati. */

const ICONE_GRUPPO = {
  azioni: Sparkles,
  pagine: ArrowRight,
  clienti: Users,
  consegne: Package,
  fattorini: Truck,
  indirizzi: MapPin,
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [termine, setTermine] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  // Gli elenchi si chiedono solo quando la ricerca si apre: non serve
  // scaricare clienti e consegne per mostrare una pagina.
  const { data: clienti = [] } = useCustomersQuery({ enabled: open });
  const { data: consegne = [] } = useDeliveriesQuery('active', { enabled: open });
  const { data: fattorini = [] } = useDriversQuery({ enabled: open });

  useEffect(() => {
    const down = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const openEvt = () => setOpen(true);
    document.addEventListener('keydown', down);
    window.addEventListener('open-command-palette', openEvt);
    return () => {
      document.removeEventListener('keydown', down);
      window.removeEventListener('open-command-palette', openEvt);
    };
  }, []);

  const pagine = useMemo(
    () => navVisibili(user).filter((voce) => !voce.divider),
    [user]
  );

  const gruppi = useMemo(() => cercaOvunque({
    termine,
    pagine,
    clienti: ensureArray(clienti),
    consegne: ensureArray(consegne),
    fattorini: ensureArray(fattorini),
  }), [termine, pagine, clienti, consegne, fattorini]);

  const go = (to) => {
    setOpen(false);
    setTermine('');
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput
        placeholder="Vai a una pagina o cerca cliente, consegna, fattorino, indirizzo…"
        value={termine}
        onValueChange={setTermine}
        data-testid="command-palette-input"
      />
      <CommandList>
        <CommandEmpty>Nessun risultato.</CommandEmpty>
        {gruppi.map((gruppo) => {
          const Icona = ICONE_GRUPPO[gruppo.chiave] || Search;
          return (
            <CommandGroup key={gruppo.chiave} heading={gruppo.etichetta}>
              {gruppo.risultati.map((risultato) => {
                const IconaRiga = risultato.icona || Icona;
                return (
                  <CommandItem
                    key={risultato.id}
                    value={risultato.id}
                    onSelect={() => go(risultato.to)}
                    className="flex items-center gap-2"
                  >
                    <IconaRiga className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{risultato.titolo}</span>
                      {risultato.dettaglio && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {risultato.dettaglio}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Plus className="h-3 w-3" />Apri una scheda senza perdere la pagina
        </span>
        <span className="inline-flex items-center gap-1">
          <UserPlus className="h-3 w-3" /><kbd className="rounded border border-border px-1 font-mono">⌘K</kbd>
        </span>
      </div>
    </CommandDialog>
  );
}
