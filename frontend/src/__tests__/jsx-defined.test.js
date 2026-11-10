import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Componenti usati in JSX ma mai importati ne' dichiarati.
 *
 * Serve perche' questa famiglia di errori passa sotto tutti i controlli: il 9/11
 * l'estrazione di una scheda ha lasciato in Customers.jsx un <SchedaCliente>
 * senza import, e <Phone> senza import in PublicTracking. Build, ESLint e
 * typecheck restano verdi (no-undef non guarda gli identificatori JSX) e gli
 * E2E non li vedono finche' nessuno apre quella schermata: il difetto si
 * presenta solo davanti all'utente, come pagina bianca o boundary di errore.
 *
 * Il confronto e' grezzo di proposito: niente parser, solo i nomi. Se un nome
 * maiuscolo compare come tag e non e' importato, dichiarato o rinominato in una
 * destrutturazione, e' quasi sempre un import dimenticato.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));

function fileSorgente(cartella) {
  const trovati = [];
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce);
    if (statSync(percorso).isDirectory()) {
      if (voce === '__tests__' || voce === 'node_modules') continue;
      trovati.push(...fileSorgente(percorso));
    } else if (/\.(js|jsx|ts|tsx)$/.test(voce)) {
      trovati.push(percorso);
    }
  }
  return trovati;
}

function nomiDefiniti(sorgente) {
  const nomi = new Set(['React', 'Fragment']);
  // Solo import con clausola di nomi: esclude `import('./x')` e `import '@/index.css'`,
  // che altrimenti allungano la cattura fino al successivo `from` e nascondono nomi veri.
  for (const trovato of sorgente.matchAll(/import\s+([\w$*{},\s]+)\s+from\s+['"]/g)) {
    for (const pezzo of trovato[1].split(/[,{}]/)) {
      const nome = pezzo.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(nome)) nomi.add(nome);
    }
  }
  for (const trovato of sorgente.matchAll(/(?:function|const|let|var)\s+([A-Z][\w$]*)/g)) nomi.add(trovato[1]);
  // rinomine nella destrutturazione: ({ icon: Icon }) => <Icon />
  for (const trovato of sorgente.matchAll(/[\w$]+\s*:\s*([A-Z][\w$]*)/g)) nomi.add(trovato[1]);
  return nomi;
}

function componentiUsati(sorgente) {
  // Il nome deve essere seguito da spazio, "/" o ">": cosi' i generici TypeScript
  // (React.forwardRef<HTMLDivElement, ...>) non entrano nel confronto.
  const tipoTs = /^(?:HTML|SVG)\w*$|Element$|Props$|Attributes$/;
  return [...sorgente.matchAll(/<([A-Z][\w$]*)(?=[\s/>])/g)]
    .map((trovato) => trovato[1])
    .filter((nome) => !tipoTs.test(nome));
}

describe('componenti JSX', () => {
  it('ogni componente usato in JSX e importato o dichiarato nel file', () => {
    const mancanti = [];
    for (const file of fileSorgente(SRC)) {
      const sorgente = readFileSync(file, 'utf8');
      if (!/<[A-Z]/.test(sorgente)) continue;
      const definiti = nomiDefiniti(sorgente);
      const ignoti = [...new Set(componentiUsati(sorgente))].filter((nome) => !definiti.has(nome));
      if (ignoti.length) mancanti.push(`${relative(SRC, file)}: ${ignoti.join(', ')}`);
    }
    expect(mancanti, `componenti senza import:\n${mancanti.join('\n')}`).toEqual([]);
  });

  it('il controllo riconosce un componente senza import', () => {
    const finto = "export default function X() { return <Mancante />; }";
    const definiti = nomiDefiniti(finto);
    expect(componentiUsati(finto).filter((nome) => !definiti.has(nome))).toEqual(['Mancante']);
  });
});
