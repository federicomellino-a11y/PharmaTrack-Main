import {
  LayoutDashboard, Users, Package, Truck, MessageSquare, Archive, Settings,
  BarChart3, Stethoscope, Phone, StickyNote, Map, Wallet, Plug,
} from 'lucide-react';

export const VOCI_MENU = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Home',          mobile: true },
  { path: '/deliveries',    icon: Package,         label: 'Consegne',      mobile: true },
  { path: '/customers',     icon: Users,           label: 'Clienti',       mobile: true },
  { path: '/drivers',       icon: Truck,           label: 'Fattorini' },
  { path: '/chat',          icon: MessageSquare,   label: 'Chat',          mobile: true, badge: true, funzione: 'chat' },
  { divider: true },
  { path: '/shifts',        icon: Wallet,          label: 'Turni & Cassa' },
  { path: '/tracking',      icon: Map,             label: 'Tracking Live' },
  { path: '/reports',       icon: BarChart3,       label: 'Report' },
  { path: '/doctors',       icon: Stethoscope,     label: 'Medici',        funzione: 'medici' },
  { path: '/useful-numbers',icon: Phone,           label: 'Numeri Utili',  funzione: 'numeri_utili' },
  { path: '/notes',         icon: StickyNote,      label: 'Block Notes',   funzione: 'block_notes' },
  { divider: true },
  { path: '/integrations',  icon: Plug,            label: 'Integrazioni' },
  { path: '/archive',       icon: Archive,         label: 'Archivio' },
  { path: '/settings',      icon: Settings,        label: 'Impostazioni' },
];

export const PAGINE_MENU = VOCI_MENU.filter((voce) => !voce.divider);

// Senza un ordine salvato resta quello di sempre, con i separatori.
export const ordinaMenu = (voci, ordine) => {
  if (!Array.isArray(ordine) || !ordine.length) return voci;
  const pagine = voci.filter((voce) => !voce.divider);
  const posto = (voce) => {
    const indice = ordine.indexOf(voce.path);
    return indice === -1 ? ordine.length + pagine.indexOf(voce) : indice;
  };
  return [...pagine].sort((a, b) => posto(a) - posto(b));
};

export const DIMENSIONI_TESTO = [
  { valore: 'normale', etichetta: 'Normale', scala: 100 },
  { valore: 'grande', etichetta: 'Grande', scala: 112.5 },
  { valore: 'molto_grande', etichetta: 'Molto grande', scala: 125 },
];

export const scalaTesto = (valore) =>
  (DIMENSIONI_TESTO.find((dimensione) => dimensione.valore === valore) || DIMENSIONI_TESTO[0]).scala;
