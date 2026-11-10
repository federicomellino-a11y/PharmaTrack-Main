/* Quali funzioni stanno nel piano Professional.

   La verità sta nel backend (backend/app/core/funzioni_pro.py): questo file
   tiene solo i nomi da scrivere accanto al lucchetto e il ripiego per quando
   /plan non è ancora arrivato. Regola: nel dubbio, aperto. Un lucchetto che
   compare per sbaglio a una farmacia che sta lavorando fa più danno di uno
   che arriva un secondo dopo.
*/

export const FUNZIONI_PRO = [
  {
    chiave: 'analisi_cliente',
    nome: 'Analisi del cliente',
    descrizione: 'Spesa mese per mese, confronto con la media della farmacia, tendenza e abitudini del paziente',
    dove: 'Scheda cliente',
  },
  {
    chiave: 'ricorrenze',
    nome: 'Ricorrenze e richiami',
    descrizione: 'Chi aspetta la consegna periodica, chi non ordina da troppo tempo, i richiami da fare',
    dove: 'Pagina Richiami',
  },
  {
    chiave: 'report_avanzati',
    nome: 'Report avanzati',
    descrizione: 'Fatturato, consegne per fattorino, top clienti e fasce orarie con export',
    dove: 'Pagina Report',
  },
];

export const funzioneSbloccata = (piano, chiave) => {
  if (!piano) return true;
  if (typeof piano.pro === 'boolean') return piano.pro;
  const voce = (piano.funzioni || []).find((funzione) => funzione.chiave === chiave);
  return voce ? Boolean(voce.sbloccata) : true;
};

export const dettaglioFunzione = (piano, chiave) =>
  (piano?.funzioni || []).find((funzione) => funzione.chiave === chiave) ||
  FUNZIONI_PRO.find((funzione) => funzione.chiave === chiave) ||
  { chiave, nome: 'Funzione Professional', descrizione: '', dove: '' };
