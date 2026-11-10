// Le fasce orarie promesse al paziente: le stesse regole del backend
// (app/core/fasce.py). Poche, larghe, comprensibili al telefono.
//
// Da oggi non sono piu' scritte una volta per tutte: ogni farmacia ha i suoi
// orari di consegna e li cambia da Impostazioni > Consegne. Restano fisse solo
// "La prima possibile" e "Orario preciso", che non sono fasce ma modi di dire
// quando arriva la consegna.

export const FASCIA_PRIMA = { valore: 'subito', etichetta: 'La prima possibile', da: null, a: null };
export const FASCIA_PRECISA = { valore: 'preciso', etichetta: 'Orario preciso…', da: '__manuale__', a: null };

// Cosa trova una farmacia che non ha mai toccato niente.
export const FASCE_PREDEFINITE = [
  { etichetta: 'Mattina', da: '09:00', a: '12:00' },
  { etichetta: 'Mezzogiorno', da: '12:00', a: '15:00' },
  { etichetta: 'Pomeriggio', da: '15:00', a: '18:00' },
  { etichetta: 'Sera', da: '18:00', a: '20:00' },
];

// Oltre otto il menu smette di essere un menu: le fasce devono restare poche.
export const MASSIMO_FASCE = 8;

export const chiaveFascia = (da, a) => `${da}-${a}`;

export const testoFasciaBreve = (fascia) => {
  if (!fascia || !fascia.da || !fascia.a) return fascia?.etichetta || '';
  return fascia.etichetta ? `${fascia.etichetta} (${fascia.da}–${fascia.a})` : `${fascia.da}–${fascia.a}`;
};

/* Le fasce che il banco vede nel modulo consegna: le due fisse agli estremi e
   in mezzo quelle della farmacia. Un elenco vuoto o storto ricade sulle
   predefinite, cosi' nessuno resta senza fasce per un JSON sbagliato. */
export const fasceDellaFarmacia = (user) => {
  const salvate = user && user.settings && user.settings.fasce;
  const elenco = Array.isArray(salvate) && salvate.length ? salvate : FASCE_PREDEFINITE;
  const valide = (righe) => righe
    .filter((fascia) => fascia && fascia.da && fascia.a)
    .slice(0, MASSIMO_FASCE)
    .map((fascia) => ({
      valore: chiaveFascia(fascia.da, fascia.a),
      etichetta: fascia.etichetta || '',
      da: fascia.da,
      a: fascia.a,
    }));
  // Un elenco che c'e' ma non contiene nemmeno una fascia buona non deve
  // lasciare il banco senza orari da scegliere: si torna alle predefinite.
  const personalizzate = valide(elenco);
  const buone = personalizzate.length ? personalizzate : valide(FASCE_PREDEFINITE);
  return [FASCIA_PRIMA, ...buone, FASCIA_PRECISA];
};

// Per chi non ha (ancora) le impostazioni sotto mano: test, stampe, primo giro.
export const FASCE = fasceDellaFarmacia(null);

export const fasciaDi = (da, a, fasce = FASCE) => {
  if (!da) return null;
  const trovata = fasce.find((f) => f.da === da && f.a === (a || null));
  if (trovata) return trovata;
  return { valore: 'preciso', etichetta: a ? `${da}–${a}` : da, da, a: a || null };
};

/* La stessa validazione del backend, ma prima del salvataggio: il banco legge
   un errore in italiano invece di una consegna rifiutata piu' tardi. */
export const normalizzaFasce = (righe) => {
  const pulite = [];
  const viste = new Set();
  const elenco = Array.isArray(righe) ? righe : [];
  for (const riga of elenco) {
    const da = (riga?.da || '').trim();
    const a = (riga?.a || '').trim();
    const etichetta = (riga?.etichetta || '').trim();
    if (!da && !a && !etichetta) continue;
    if (!da || !a) {
      return { ok: false, errore: 'Ogni fascia oraria ha bisogno di un inizio e di una fine' };
    }
    if (da >= a) {
      return { ok: false, errore: `Nella fascia "${etichetta || `${da}–${a}`}" la fine deve venire dopo l'inizio` };
    }
    const chiave = chiaveFascia(da, a);
    if (viste.has(chiave)) {
      return { ok: false, errore: `La fascia ${da}–${a} e' ripetuta` };
    }
    viste.add(chiave);
    pulite.push({ etichetta: etichetta || `${da}–${a}`, da, a });
  }
  if (!pulite.length) return { ok: false, errore: 'Lascia almeno una fascia oraria' };
  if (pulite.length > MASSIMO_FASCE) return { ok: false, errore: `Al massimo ${MASSIMO_FASCE} fasce` };
  return { ok: true, fasce: pulite };
};

export const testoFascia = (da, a) => (da ? (a ? `${da}–${a}` : da) : null);

/* La promessa come va letta dal paziente: il giorno prima della fascia.

   "15:00-18:00" da solo non risponde alla domanda che il paziente fa davvero
   ("quando arriva?"): puo' essere oggi o dopodomani. Se la consegna non ha una
   fascia ma il giorno e' oggi o domani, il giorno da solo vale la pena; una
   data vecchia senza fascia no, sarebbe una promessa che nessuno ha fatto.
*/
export const testoPromessa = (giorno, fascia) => {
  if (fascia) return [giorno, fascia].filter(Boolean).join(' ');
  return ['oggi', 'domani'].includes(giorno) ? giorno : null;
};
