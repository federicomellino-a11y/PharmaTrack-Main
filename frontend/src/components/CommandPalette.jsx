import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from './ui/command';
import {
  LayoutDashboard, Users, Package, Truck, MessageSquare, Archive, Settings,
  BarChart3, Stethoscope, Phone, StickyNote, Map, Wallet, Plug, Plus, UserPlus,
} from 'lucide-react';

const navTargets = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Home / Dashboard' },
  { path: '/deliveries', icon: Package, label: 'Consegne' },
  { path: '/customers', icon: Users, label: 'Clienti' },
  { path: '/drivers', icon: Truck, label: 'Fattorini' },
  { path: '/chat', icon: MessageSquare, label: 'Chat' },
  { path: '/shifts', icon: Wallet, label: 'Turni & Cassa' },
  { path: '/tracking', icon: Map, label: 'Tracking Live' },
  { path: '/reports', icon: BarChart3, label: 'Report' },
  { path: '/doctors', icon: Stethoscope, label: 'Medici' },
  { path: '/useful-numbers', icon: Phone, label: 'Numeri Utili' },
  { path: '/notes', icon: StickyNote, label: 'Block Notes' },
  { path: '/integrations', icon: Plug, label: 'Integrazioni' },
  { path: '/archive', icon: Archive, label: 'Archivio' },
  { path: '/settings', icon: Settings, label: 'Impostazioni' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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

  const go = (path) => { setOpen(false); navigate(path); };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Cerca una sezione o un'azione…" data-testid="command-palette-input" />
      <CommandList>
        <CommandEmpty>Nessun risultato.</CommandEmpty>
        <CommandGroup heading="Azioni rapide">
          <CommandItem onSelect={() => go('/deliveries?new=true')} data-testid="cmd-new-delivery">
            <Plus className="mr-2 h-4 w-4" />
            Nuova consegna
          </CommandItem>
          <CommandItem onSelect={() => go('/customers?new=true')} data-testid="cmd-new-customer">
            <UserPlus className="mr-2 h-4 w-4" />
            Nuovo cliente
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Vai a">
          {navTargets.map((t) => (
            <CommandItem key={t.path} onSelect={() => go(t.path)}>
              <t.icon className="mr-2 h-4 w-4" />
              {t.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
