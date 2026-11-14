import { describe, expect, it } from 'vitest';
import {
  VOCI_MENU, GRUPPI_MENU, ordinaMenu, raggruppaMenu, navVisibili, scalaTesto,
} from '../vociMenu';

describe('ordine del menu', () => {
  it('senza ordine salvato resta quello di sempre', () => {
    expect(ordinaMenu(VOCI_MENU, [])).toBe(VOCI_MENU);
  });

  it('mette prima le voci scelte dentro il loro gruppo, non fuori', () => {
    const voci = ordinaMenu(VOCI_MENU, ['/reports', '/chat']);
    // "Chat" e "Report" sono in due gruppi diversi: l'ordine personale non
    // puo' portare Report (Amministrazione) davanti a Home (Operativita').
    expect(voci.filter((voce) => voce.gruppo === 'operativita').map((v) => v.path))
      .toEqual(['/chat', '/dashboard', '/deliveries', '/tracking']);
    expect(voci.filter((voce) => voce.gruppo === 'amministrazione')[0].path).toBe('/reports');
  });

  it('le impostazioni restano in fondo comunque sia l ordine salvato', () => {
    const voci = ordinaMenu(VOCI_MENU, ['/settings', '/notes']);
    expect(voci[voci.length - 1].path).toBe('/settings');
  });

  it('una dimensione sconosciuta torna normale', () => {
    expect(scalaTesto('boh')).toBe(100);
    expect(scalaTesto('grande')).toBe(112.5);
  });
});

describe('gruppi del menu', () => {
  it('sono i cinque annunciati, con le impostazioni da sole in fondo', () => {
    const { gruppi, fondo } = raggruppaMenu(VOCI_MENU);
    expect(gruppi.map((gruppo) => gruppo.etichetta))
      .toEqual(GRUPPI_MENU.map((gruppo) => gruppo.etichetta));
    expect(fondo.map((voce) => voce.path)).toEqual(['/settings']);
  });

  it('ogni pagina sta in un gruppo solo o in fondo, mai in due', () => {
    const { gruppi, fondo } = raggruppaMenu(VOCI_MENU);
    const tutte = [...gruppi.flatMap((gruppo) => gruppo.voci), ...fondo];
    expect(tutte).toHaveLength(VOCI_MENU.filter((voce) => !voce.divider).length);
    expect(new Set(tutte.map((voce) => voce.path)).size).toBe(tutte.length);
  });

  it('le voci richieste da Federico sono tutte al loro posto', () => {
    const { gruppi } = raggruppaMenu(VOCI_MENU);
    const per = Object.fromEntries(
      gruppi.map((gruppo) => [gruppo.chiave, gruppo.voci.map((voce) => voce.label)])
    );
    expect(per.operativita).toEqual(['Home', 'Consegne', 'Tracking', 'Chat']);
    expect(per.anagrafiche).toEqual(['Clienti', 'Fattorini', 'Mappa clienti']);
    expect(per.amministrazione).toEqual(['Turni e Cassa', 'Report', 'Archivio']);
    expect(per.strumenti).toEqual(['Integrazioni', 'Medici', 'Numeri utili', 'Block Notes']);
  });
});

describe('funzioni spente', () => {
  it('una funzione spenta dalla farmacia non entra nel menu', () => {
    const voci = navVisibili({ settings: { funzioni: { chat: false, medici: false } } });
    const percorsi = voci.map((voce) => voce.path);
    expect(percorsi).not.toContain('/chat');
    expect(percorsi).not.toContain('/doctors');
    expect(percorsi).toContain('/deliveries');
  });

  it('senza preferenze salvate vedi tutto tranne niente', () => {
    expect(navVisibili({}).map((voce) => voce.path)).toContain('/notes');
  });
});
