/* Gli extra della scheda del Consegna veloce. Tutti spenti finche' la farmacia
   non li accende da Impostazioni: vivono in user.settings.pulsante. */
export const OPZIONI_PULSANTE = [
  { chiave: 'farmaci', nome: 'Farmaci nel sacchetto', dove: 'Nomi e pezzi letti da Winfarm, nelle note per il fattorino' },
  { chiave: 'etichetta', nome: 'Stampa etichetta alla creazione', dove: 'Si apre la stampa appena confermi' },
  { chiave: 'fattorino', nome: 'Scelta del fattorino', dove: 'Nella scheda: assegni subito la consegna' },
];

export const opzioniPulsante = (user) => {
  const salvate = (user && user.settings && user.settings.pulsante) || {};
  return OPZIONI_PULSANTE.reduce((tutte, { chiave }) => ({ ...tutte, [chiave]: salvate[chiave] === true }), {});
};

const due = (n) => String(n).padStart(2, '0');

/** Giorno della consegna come lo vuole il server: oggi non si scrive, domani si'. */
export const dataConsegna = (giorno, adesso = new Date()) => {
  if (giorno !== 'domani') return null;
  const d = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + 1);
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
};

/** Le note che partono con la consegna: quelle scritte a mano piu' il sacchetto. */
export const noteConsegna = ({ note, contenuto, pezzi, conSacchetto }) => {
  const parti = [(note || '').trim()];
  if (conSacchetto) {
    const cosa = (contenuto || '').trim();
    const quanti = Number(pezzi) > 0 ? `${pezzi} ${Number(pezzi) === 1 ? 'pezzo' : 'pezzi'}` : '';
    if (cosa || quanti) parti.push(`Sacchetto: ${[cosa, quanti].filter(Boolean).join(' · ')}`);
  }
  return parti.filter(Boolean).join(' — ');
};

/** I farmaci letti da Winfarm, uno per riga: nel campo arrivano uniti da ";" e
    la scheda li mostra separati, cosi' una vendita da tre pezzi si vede tutta. */
export const prodottiDaTesto = (testo) => (testo || '')
  .split(';')
  .map((voce) => voce.trim())
  .filter(Boolean);
