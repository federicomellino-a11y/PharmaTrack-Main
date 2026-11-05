/**
 * Chiamare un numero dal gestionale.
 *
 * Su telefono il link `tel:` fa il suo lavoro. Su desktop non c'e' nessun
 * programma registrato per quello schema e il browser scrive in console
 * "Failed to launch 'tel:...' because the scheme does not have a registered
 * handler": il click non fa niente e sembra un guasto dell'app. Qui, sui
 * dispositivi senza telefono, il numero finisce negli appunti.
 */

export function numeroPerTel(numero) {
  return String(numero || '').replace(/[^\d+]/g, '');
}

export function sembraDispositivoConTelefono() {
  if (typeof window === 'undefined') return false;
  const tocco = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const mobile = /Android|iPhone|iPad|iPod|Mobi|Windows Phone/i.test(
    (typeof navigator !== 'undefined' && navigator.userAgent) || '',
  );
  return tocco || mobile;
}

/**
 * Da usare come onClick di un link tel:. Restituisce true se ha lasciato
 * passare il browser al programma di telefonia, false se ha copiato il numero.
 */
export async function gestisciClickTelefono(evento, numero, opzioni = {}) {
  const pulito = numeroPerTel(numero);
  if (!pulito) {
    evento?.preventDefault?.();
    return false;
  }
  if (sembraDispositivoConTelefono()) return true;

  evento?.preventDefault?.();
  const copia = opzioni.copia
    || (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText
      ? (testo) => navigator.clipboard.writeText(testo)
      : null);
  if (copia) {
    try {
      await copia(pulito);
      opzioni.onCopiato?.(pulito);
      return false;
    } catch {
      // se gli appunti sono negati si prova comunque ad aprire il numero
    }
  }
  opzioni.onNonCopiato?.(pulito);
  return false;
}


/**
 * Una sola intercettazione per tutti i link tel: dell'app.
 *
 * Cambiare sei punti nel JSX avrebbe voluto dire toccare la struttura di
 * quattro pagine per un difetto che sta altrove: il click che non fa niente
 * sui desktop. Qui si ascolta in fase di cattura e si decide una volta sola.
 * Restituisce la funzione per staccare il listener (serve nei test).
 */
export function installaGestioneTelefono(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return () => {};
  const gestore = async (evento) => {
    const link = evento.target?.closest?.('a[href^="tel:"]');
    if (!link) return;
    const numero = link.getAttribute('href').replace(/^tel:/, '');
    const lasciaPassare = await gestisciClickTelefono(evento, numero, {
      onCopiato: (valore) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pharmatrack:numero-copiato', { detail: valore }));
        }
      },
    });
    if (!lasciaPassare) evento.preventDefault();
  };
  doc.addEventListener('click', gestore, true);
  return () => doc.removeEventListener('click', gestore, true);
}
