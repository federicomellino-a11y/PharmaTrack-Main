/* Gli extra della scheda del pulsante magico. Tutti spenti finche' la farmacia
   non li accende da Impostazioni: vivono in user.settings.pulsante. */
export const OPZIONI_PULSANTE = [
  { chiave: 'farmaci', nome: 'Contenuto del sacchetto', dove: 'Nella scheda: pezzi letti da Winfarm e farmaci da annotare' },
  { chiave: 'etichetta', nome: 'Stampa etichetta alla creazione', dove: 'Si apre la stampa appena confermi' },
  { chiave: 'fattorino', nome: 'Scelta del fattorino', dove: 'Nella scheda: assegni subito la consegna' },
  { chiave: 'vendite_oggi', nome: 'Vendite di oggi', dove: 'Elenco nella pagina Integrazioni' },
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
