/* Le esportazioni, tutte in un posto.

   Perche' esistono qui e non nelle pagine: Federico (11/11) vuole un solo
   punto da cui scaricare i dati, in Impostazioni, con un menu che dice cosa si
   puo' esportare. Le pagine facevano ognuna il suo pulsante e chi cercava il
   file dei fattorini non sapeva dove guardare.

   I costruttori sono funzioni pure: si possono provare senza browser, e il
   test guarda quello che finisce davvero dentro il file.
*/
import { costruisciCsv, scaricaCsv } from './consegneCsv';
import { costruisciCsvClienti } from './clientiCsv';
import { ensureArray } from './collections';

const esc = (valore) => '"' + String(valore ?? '').replace(/"/g, '""') + '"';
const oggi = () => new Date().toISOString().slice(0, 10);
// Il commercialista legge la colonna con gli occhi: 87,00 e' un importo, 87 no.
const importo = (valore) => (valore == null ? '' : Number(valore).toFixed(2).replace('.', ','));
const conBom = (righe) => '\ufeff' + righe.join('\n');

/* Cosa si può esportare, nell'ordine in cui compare nel menu.
   `funzionePro` dice quale chiave del piano serve: se è chiusa, la voce non
   compare nemmeno, invece di dare un pulsante che risponde 402. */
export const ESPORTAZIONI = [
  {
    chiave: 'consegne',
    nome: 'Consegne attive',
    descrizione: 'Le consegne aperte, con data prevista, fascia e fattorino',
  },
  {
    chiave: 'archivio',
    nome: 'Archivio consegne',
    descrizione: 'Consegnate e annullate, con il motivo',
  },
  {
    chiave: 'clienti',
    nome: 'Anagrafica clienti',
    descrizione: 'Recapiti, indirizzi, codice fiscale e note',
  },
  {
    chiave: 'fattorini',
    nome: 'Fattorini',
    descrizione: 'Chi consegna, con i contatti',
  },
  {
    chiave: 'turni',
    nome: 'Turni e cassa',
    descrizione: 'Incasso atteso contro ricevuto, turno per turno',
    funzionePro: 'turni_cassa',
  },
  {
    chiave: 'report',
    nome: 'Report del mese',
    descrizione: 'Fatturato, top clienti, fasce orarie e resa dei fattorini',
    funzionePro: 'report_avanzati',
  },
];

/** Turni e cassa: quanto doveva entrare e quanto è entrato. */
export function costruisciCsvTurni(turni) {
  const intestazione = ['Fattorino', 'Aperto il', 'Chiuso il', 'Stato', 'Consegne',
    'Contanti attesi', 'Contanti ricevuti', 'Differenza', 'POS'];
  const righe = [intestazione.join(',')];
  ensureArray(turni).forEach((turno) => {
    const totali = turno.totals || {};
    righe.push([
      turno.driver_name || '',
      turno.started_at ? new Date(turno.started_at).toLocaleString('it-IT') : '',
      turno.closed_at ? new Date(turno.closed_at).toLocaleString('it-IT') : '',
      turno.status === 'settled' ? 'Confermato' : turno.status === 'closed' ? 'Chiuso, da confermare' : 'Aperto',
      totali.deliveries ?? 0,
      importo(totali.cash_total ?? 0),
      importo(turno.confirmed_cash),
      importo(turno.discrepancy),
      importo(totali.pos_total ?? 0),
    ].map(esc).join(','));
  });
  return conBom(righe);
}

/** I fattorini: chi lavora per la farmacia e come si chiama. */
export function costruisciCsvFattorini(fattorini) {
  const intestazione = ['Nome', 'Telefono', 'Email', 'Attivo', 'Mezzo', 'In servizio dal'];
  const righe = [intestazione.join(',')];
  ensureArray(fattorini).forEach((f) => {
    righe.push([
      f.name || '',
      f.phone || '',
      f.email || '',
      f.is_active ? 'Sì' : 'No',
      f.vehicle_type || '',
      f.created_at ? String(f.created_at).slice(0, 10) : '',
    ].map(esc).join(','));
  });
  return conBom(righe);
}

/** Il report del periodo, con la stessa forma che aveva sulla pagina Report. */
export function costruisciCsvReport(dati, period = 'month') {
  const etichette = { week: 'Settimana', month: 'Mese', quarter: 'Trimestre', year: 'Anno' };
  const riepilogo = dati?.summary || {};
  const righe = [];
  righe.push(['PharmaTrack - Analytics']);
  righe.push([`Periodo: ${etichette[period] || period}`]);
  righe.push([`Generato il: ${new Date().toLocaleString('it-IT')}`]);
  righe.push([]);
  righe.push(['RIEPILOGO']);
  righe.push(['Fatturato totale', `€${(riepilogo.total_revenue || 0).toFixed(2)}`]);
  righe.push(['Consegne completate', riepilogo.delivered_count || 0]);
  righe.push(['Consegne totali', riepilogo.total_deliveries || 0]);
  righe.push(['Tasso completamento', `${riepilogo.completion_rate || 0}%`]);
  righe.push(['Valore medio ordine', `€${(riepilogo.avg_order_value || 0).toFixed(2)}`]);
  righe.push([]);

  const giornaliero = ensureArray(dati?.daily_revenue);
  if (giornaliero.length) {
    righe.push(['FATTURATO GIORNALIERO']);
    righe.push(['Data', 'Fatturato', 'Consegne']);
    giornaliero.forEach((r) => righe.push([r.date, `€${(r.revenue || 0).toFixed(2)}`, r.count]));
    righe.push([]);
  }

  const top = ensureArray(dati?.top_customers);
  if (top.length) {
    righe.push(['TOP CLIENTI']);
    righe.push(['Nome', 'Consegne', 'Fatturato']);
    top.forEach((c) => righe.push([c.name, c.deliveries, `€${(c.revenue || 0).toFixed(2)}`]));
    righe.push([]);
  }

  const fattorini = ensureArray(dati?.driver_performance);
  if (fattorini.length) {
    righe.push(['PERFORMANCE FATTORINI']);
    righe.push(['Nome', 'Consegne', 'Fatturato gestito']);
    fattorini.forEach((f) => righe.push([f.name, f.deliveries, `€${(f.revenue || 0).toFixed(2)}`]));
  }

  return conBom(righe.map((riga) => riga.map(esc).join(',')));
}

/**
 * Il caricatore di ogni voce: prende la cache di react-query, legge il dato e
 * restituisce { contenuto, nomeFile, righe }. `righe` serve al messaggio
 * "12 righe esportate" e a fermarsi quando non c'è niente da scaricare.
 */
export const CARICATORI = {
  async consegne(qc, letture, chiavi) {
    const [consegne, fattorini] = await Promise.all([
      qc.fetchQuery({ queryKey: chiavi.deliveries(), queryFn: letture.deliveries() }),
      qc.fetchQuery({ queryKey: chiavi.drivers, queryFn: letture.drivers }),
    ]);
    return {
      contenuto: costruisciCsv(consegne, fattorini),
      nomeFile: `consegne-${oggi()}.csv`,
      righe: ensureArray(consegne).length,
    };
  },
  async archivio(qc, letture, chiavi) {
    const [dati, fattorini] = await Promise.all([
      qc.fetchQuery({ queryKey: chiavi.archivio(1, 500), queryFn: letture.archivio(1, 500) }),
      qc.fetchQuery({ queryKey: chiavi.drivers, queryFn: letture.drivers }),
    ]);
    const consegne = ensureArray(dati?.deliveries);
    return {
      contenuto: costruisciCsv(consegne, fattorini),
      nomeFile: `archivio-consegne-${oggi()}.csv`,
      righe: consegne.length,
    };
  },
  async clienti(qc, letture, chiavi) {
    const clienti = await qc.fetchQuery({ queryKey: chiavi.customers, queryFn: letture.customers });
    return {
      contenuto: costruisciCsvClienti(clienti),
      nomeFile: `clienti-${oggi()}.csv`,
      righe: ensureArray(clienti).length,
    };
  },
  async fattorini(qc, letture, chiavi) {
    const fattorini = await qc.fetchQuery({ queryKey: chiavi.drivers, queryFn: letture.drivers });
    return {
      contenuto: costruisciCsvFattorini(fattorini),
      nomeFile: `fattorini-${oggi()}.csv`,
      righe: ensureArray(fattorini).length,
    };
  },
  async turni(qc, letture, chiavi) {
    const turni = await qc.fetchQuery({ queryKey: chiavi.shifts, queryFn: letture.shifts });
    return {
      contenuto: costruisciCsvTurni(turni),
      nomeFile: `turni-cassa-${oggi()}.csv`,
      righe: ensureArray(turni).length,
    };
  },
  async report(qc, letture, chiavi) {
    const periodo = 'month';
    const dati = await qc.fetchQuery({ queryKey: chiavi.analytics(periodo), queryFn: letture.analytics(periodo) });
    return {
      contenuto: costruisciCsvReport(dati, periodo),
      nomeFile: `pharmatrack-report-${periodo}-${oggi()}.csv`,
      righe: ensureArray(dati?.daily_revenue).length,
    };
  },
};

/** Scarica la voce scelta. Restituisce quante righe sono uscite (0 = vuoto). */
export async function esporta(chiave, qc, letture, chiavi) {
  const caricatore = CARICATORI[chiave];
  if (!caricatore) throw new Error(`Esportazione sconosciuta: ${chiave}`);
  const { contenuto, nomeFile, righe } = await caricatore(qc, letture, chiavi);
  if (!righe) return 0;
  scaricaCsv(contenuto, nomeFile);
  return righe;
}
