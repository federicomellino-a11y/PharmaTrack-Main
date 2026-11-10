/* Le funzioni della farmacia che si possono spegnere.

   Una farmacia piccola non usa la chat, un'altra non tiene la rubrica dei
   medici: invece di far vedere voci di menu che nessuno apre, si spengono da
   Impostazioni. La scelta vive in user.settings.funzioni, quindi e' della
   farmacia e non del dispositivo: cambiare PC non cambia il menu.

   Regola (la stessa dei piani): assente significa acceso. Solo un `false`
   scritto davvero spegne qualcosa, cosi' un JSON storto non fa sparire meta'
   applicazione a chi non ha toccato niente.
*/

export const FUNZIONI_FARMACIA = [
  {
    chiave: 'chat',
    nome: 'Chat con i fattorini',
    descrizione: "La chat dentro l'app fra banco e fattorini. Spenta, restano telefono e consegne.",
    percorso: '/chat',
  },
  {
    chiave: 'medici',
    nome: 'Rubrica medici',
    descrizione: "L'elenco dei medici con cui lavora la farmacia. Tolta la voce, i contatti restano salvati.",
    percorso: '/doctors',
  },
  {
    chiave: 'numeri_utili',
    nome: 'Numeri utili',
    descrizione: 'I numeri che servono al banco: ospedali, guardia medica, fornitori.',
    percorso: '/useful-numbers',
  },
  {
    chiave: 'block_notes',
    nome: 'Block notes',
    descrizione: "Gli appunti della farmacia: quelli che non sono ne' consegne ne' clienti.",
    percorso: '/notes',
  },
  {
    chiave: 'cassa_home',
    nome: 'Cassa di oggi in home',
    descrizione: 'Il riquadro con il totale incassato, contanti e POS. Si spegne quando la home resta sotto gli occhi dei clienti.',
    percorso: null,
  },
];

const CHIAVI = FUNZIONI_FARMACIA.map((funzione) => funzione.chiave);

/* Tutte le funzioni, chiave per chiave, con il valore che vale davvero. */
export const funzioniDellaFarmacia = (user) => {
  const salvate = (user && user.settings && user.settings.funzioni) || {};
  return CHIAVI.reduce((tutte, chiave) => {
    tutte[chiave] = salvate[chiave] !== false;
    return tutte;
  }, {});
};

export const funzioneAttiva = (user, chiave) => funzioniDellaFarmacia(user)[chiave] !== false;

/* La funzione che governa una pagina: null vuol dire nessun interruttore. */
export const funzioneDelPercorso = (pathname) =>
  FUNZIONI_FARMACIA.find((funzione) => funzione.percorso && pathname.startsWith(funzione.percorso)) || null;
