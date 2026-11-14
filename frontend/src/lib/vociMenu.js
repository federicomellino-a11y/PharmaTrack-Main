import {
  LayoutDashboard, Users, Package, Truck, MessageSquare, Archive, Settings,
  BarChart3, Stethoscope, Phone, StickyNote, Map, MapPinned, Wallet, Plug,
} from 'lucide-react';
import { funzioniDellaFarmacia } from './funzioniFarmacia';

/* Il menu laterale, diviso per gruppi.
   L'ordine dentro ogni gruppo e' quello qui sotto; l'ordine salvato dalla
   farmacia (settings.ordine_menu) continua a valere, ma solo dentro il gruppo
   di appartenenza: trascinare "Report" in cima non lo porta fuori da
   Amministrazione. Le Impostazioni stanno sempre in fondo, da sole. */

export const GRUPPI_MENU = [
  { chiave: 'operativita', etichetta: 'Operatività' },
  { chiave: 'anagrafiche', etichetta: 'Anagrafiche' },
  { chiave: 'amministrazione', etichetta: 'Amministrazione' },
  { chiave: 'strumenti', etichetta: 'Strumenti' },
];

export const VOCI_MENU = [
  { path: '/dashboard',     gruppo: 'operativita',     icon: LayoutDashboard, label: 'Home',          mobile: true },
  { path: '/deliveries',    gruppo: 'operativita',     icon: Package,         label: 'Consegne',      mobile: true },
  { path: '/tracking',      gruppo: 'operativita',     icon: Map,             label: 'Tracking' },
  { path: '/chat',          gruppo: 'operativita',     icon: MessageSquare,   label: 'Chat',          mobile: true, badge: true, funzione: 'chat' },

  { path: '/customers',     gruppo: 'anagrafiche',     icon: Users,           label: 'Clienti',       mobile: true },
  { path: '/drivers',       gruppo: 'anagrafiche',     icon: Truck,           label: 'Fattorini' },
  { path: '/mappa',         gruppo: 'anagrafiche',     icon: MapPinned,       label: 'Mappa clienti' },

  { path: '/shifts',        gruppo: 'amministrazione', icon: Wallet,          label: 'Turni e Cassa' },
  { path: '/reports',       gruppo: 'amministrazione', icon: BarChart3,       label: 'Report' },
  { path: '/archive',       gruppo: 'amministrazione', icon: Archive,         label: 'Archivio' },

  { path: '/integrations',  gruppo: 'strumenti',       icon: Plug,            label: 'Integrazioni' },
  { path: '/doctors',       gruppo: 'strumenti',       icon: Stethoscope,     label: 'Medici',        funzione: 'medici' },
  { path: '/useful-numbers',gruppo: 'strumenti',       icon: Phone,           label: 'Numeri utili',  funzione: 'numeri_utili' },
  { path: '/notes',         gruppo: 'strumenti',       icon: StickyNote,      label: 'Block Notes',   funzione: 'block_notes' },

  { path: '/settings',      icon: Settings,            label: 'Impostazioni', fondo: true },
];

export const PAGINE_MENU = VOCI_MENU.filter((voce) => !voce.divider);

const posizionePersonale = (voce, pagine, ordine) => {
  const indice = ordine.indexOf(voce.path);
  return indice === -1 ? ordine.length + pagine.indexOf(voce) : indice;
};

/**
 * Applica l'ordine scelto dalla farmacia dentro ogni gruppo.
 * Le voci in fondo (Impostazioni) restano in fondo comunque.
 */
export const ordinaMenu = (voci = VOCI_MENU, ordine = []) => {
  if (!Array.isArray(ordine) || !ordine.length) return voci;
  const pagine = voci.filter((voce) => !voce.divider);
  const posto = (voce) => posizionePersonale(voce, pagine, ordine);
  return [...pagine].sort((a, b) => {
    if (Boolean(a.fondo) !== Boolean(b.fondo)) return a.fondo ? 1 : -1;
    if (a.gruppo !== b.gruppo) return 0;
    return posto(a) - posto(b);
  });
};

/** Le voci in gruppi pronti da disegnare, piu' quelle in fondo. */
export const raggruppaMenu = (voci = VOCI_MENU) => {
  const pagine = voci.filter((voce) => !voce.divider);
  const gruppi = GRUPPI_MENU
    .map((gruppo) => ({
      ...gruppo,
      voci: pagine.filter((voce) => voce.gruppo === gruppo.chiave),
    }))
    .filter((gruppo) => gruppo.voci.length > 0);
  return {
    gruppi,
    fondo: pagine.filter((voce) => voce.fondo),
  };
};

/** Una funzione spenta dalla farmacia non compare, ne' nel menu ne' nella ricerca. */
export const navVisibili = (user) => {
  const accese = funzioniDellaFarmacia(user);
  const voci = ordinaMenu(VOCI_MENU, user?.settings?.ordine_menu);
  return voci.filter((voce) => voce.divider || !voce.funzione || accese[voce.funzione] !== false);
};

export const DIMENSIONI_TESTO = [
  { valore: 'normale', etichetta: 'Normale', scala: 100 },
  { valore: 'grande', etichetta: 'Grande', scala: 112.5 },
  { valore: 'molto_grande', etichetta: 'Molto grande', scala: 125 },
];

export const scalaTesto = (valore) =>
  (DIMENSIONI_TESTO.find((dimensione) => dimensione.valore === valore) || DIMENSIONI_TESTO[0]).scala;
