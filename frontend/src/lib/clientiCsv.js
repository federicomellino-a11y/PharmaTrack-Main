/* Il foglio dell'anagrafica clienti, nella stessa forma delle consegne.

   Perche' serve: le consegne si esportavano, i pazienti no. Chi cambia
   gestionale o deve passare i recapiti al medico/consulente li ricopiava a
   mano. Come per le consegne il file non tocca il browser: si costruisce qui,
   cosi' i test guardano quello che finisce davvero dentro.
*/
import { scaricaCsv } from './consegneCsv';

const esc = (valore) => '"' + String(valore ?? '').replace(/"/g, '""') + '"';

export function costruisciCsvClienti(clienti) {
  const intestazione = ['Nome', 'Telefono', 'Altri telefoni', 'Email', 'Codice fiscale',
    'Indirizzo', 'Data di nascita', 'Cliente dal', 'Note'];
  const righe = [intestazione.join(',')];
  (clienti || []).forEach((c) => {
    const altri = Array.isArray(c.extra_phones) ? c.extra_phones.filter(Boolean).join(' / ') : '';
    righe.push([
      c.name || '',
      c.phone || '',
      altri,
      c.email || '',
      c.fiscal_code || '',
      c.address || '',
      c.birth_date ? String(c.birth_date).slice(0, 10) : '',
      c.created_at ? String(c.created_at).slice(0, 10) : '',
      c.notes || '',
    ].map(esc).join(','));
  });
  // Il BOM serve a Excel: senza, apre in ANSI e sbaglia gli accenti.
  return '\ufeff' + righe.join('\n');
}

/** Il file dei clienti, gia' scaricato con il nome giusto. */
export function scaricaCsvClienti(clienti) {
  scaricaCsv(
    costruisciCsvClienti(clienti),
    'clienti-' + new Date().toISOString().slice(0, 10) + '.csv'
  );
}
