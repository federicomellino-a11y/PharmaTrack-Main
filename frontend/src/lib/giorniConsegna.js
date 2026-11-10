/* Giorni e taglio orario delle consegne.

   Due domande che il banco si sente fare ogni giorno: "consegnate oggi?" e
   "se ordino adesso, quando arriva?". Le risposte dipendono da due cose che
   solo la farmacia conosce: i giorni in cui il fattorino gira davvero e l'ora
   dopo la quale un ordine slitta al giorno dopo. Stavano nella testa di chi
   prendeva l'ordine; qui diventano un conto fatto una volta sola.
*/

// JS conta i giorni da domenica (0): li scriviamo col numero che usa lui, cosi'
// il confronto con una data e' diretto e non serve nessuna tabella di mezzo.
export const GIORNI_SETTIMANA = [
  { numero: 1, breve: 'Lun', nome: 'lunedì' },
  { numero: 2, breve: 'Mar', nome: 'martedì' },
  { numero: 3, breve: 'Mer', nome: 'mercoledì' },
  { numero: 4, breve: 'Gio', nome: 'giovedì' },
  { numero: 5, breve: 'Ven', nome: 'venerdì' },
  { numero: 6, breve: 'Sab', nome: 'sabato' },
  { numero: 0, breve: 'Dom', nome: 'domenica' },
];

// Chi non ha mai toccato niente consegna dal lunedi' al sabato: e' quello che
// fa quasi ogni farmacia italiana, e la domenica resta fuori.
export const GIORNI_PREDEFINITI = [1, 2, 3, 4, 5, 6];

export const TAGLIO_PREDEFINITO = '12:00';

const NUMERI_VALIDI = [0, 1, 2, 3, 4, 5, 6];

/* I giorni scelti dalla farmacia, ripuliti. Un elenco vuoto o storto vale i
   predefiniti: meglio un giorno di troppo che un modulo senza date. */
export const giorniConsegnati = (settings) => {
  const salvati = settings && settings.giorni_consegna;
  const elenco = Array.isArray(salvati) ? salvati : GIORNI_PREDEFINITI;
  const buoni = elenco
    .map((giorno) => Number(giorno))
    .filter((giorno, indice, tutti) => NUMERI_VALIDI.includes(giorno) && tutti.indexOf(giorno) === indice)
    .sort((a, b) => a - b);
  return buoni.length ? buoni : [...GIORNI_PREDEFINITI];
};

export const taglioOrdini = (settings) => {
  const scritto = settings && settings.taglio_ordini;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(scritto || '') ? scritto : TAGLIO_PREDEFINITO;
};

export const dataISO = (data) => {
  const anno = data.getFullYear();
  const mese = String(data.getMonth() + 1).padStart(2, '0');
  const giorno = String(data.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
};

export const giornoDiConsegna = (settings, data) => {
  const numero = data instanceof Date ? data.getDay() : new Date(`${data}T12:00:00`).getDay();
  return giorniConsegnati(settings).includes(numero);
};

/* La data che il modulo consegna propone da solo.

   Si parte da oggi; se oggi il fattorino non gira, o se l'ora dell'ordine e'
   gia' passata rispetto al taglio, si parte da domani. Poi si scorre in avanti
   fino al primo giorno buono. Se la farmacia ha spento tutti i giorni (non
   dovrebbe, ma i dati sono dati) si resta su oggi: nessun blocco.
*/
export const dataConsegnaPredefinita = (settings, adesso = new Date()) => {
  const giorni = giorniConsegnati(settings);
  const [ore, minuti] = taglioOrdini(settings).split(':').map(Number);
  const limite = ore * 60 + minuti;
  const oraAdesso = adesso.getHours() * 60 + adesso.getMinutes();

  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const partenza = giorni.includes(oggi.getDay()) && oraAdesso <= limite ? 0 : 1;

  for (let passo = partenza; passo < partenza + 8; passo += 1) {
    const candidato = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + passo);
    if (giorni.includes(candidato.getDay())) return dataISO(candidato);
  }
  return dataISO(oggi);
};
