// Le stesse fasce del backend (app/core/fasce.py): poche e comprensibili
// al telefono. Se cambiano, vanno cambiate in entrambi i posti.
export const FASCE = [
  { valore: 'subito', etichetta: 'La prima possibile', da: null, a: null },
  { valore: 'mattina', etichetta: 'Mattina (9–12)', da: '09:00', a: '12:00' },
  { valore: 'mezzogiorno', etichetta: 'Mezzogiorno (12–15)', da: '12:00', a: '15:00' },
  { valore: 'pomeriggio', etichetta: 'Pomeriggio (15–18)', da: '15:00', a: '18:00' },
  { valore: 'sera', etichetta: 'Sera (18–20)', da: '18:00', a: '20:00' },
  { valore: 'preciso', etichetta: 'Orario preciso…', da: '__manuale__', a: null },
];

export const fasciaDi = (da, a) => {
  if (!da) return null;
  const trovata = FASCE.find((f) => f.da === da && f.a === (a || null));
  if (trovata) return trovata;
  return { valore: 'preciso', etichetta: a ? `${da}–${a}` : da, da, a: a || null };
};

export const testoFascia = (da, a) => (da ? (a ? `${da}–${a}` : da) : null);
