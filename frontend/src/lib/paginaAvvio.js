/* Dove riparte l'app dopo l'accesso.

   Chi apre PharmaTrack la mattina lo fa quasi sempre per la stessa cosa: chi
   consegna oggi, oppure l'elenco delle consegne. La home va bene per la
   farmacia che guarda i numeri; chi lavora di lista vuole la lista. La scelta
   sta nelle impostazioni dell'account, non nel browser.

   Solo due destinazioni, e nessuna che possa essere spenta: il riavvio non deve
   portare su una pagina chiusa da un altro interruttore.
*/
export const PAGINE_DI_AVVIO = {
  dashboard: '/dashboard',
  deliveries: '/deliveries',
};

export const paginaDiAvvio = (user) => {
  const scelta = user && user.settings && user.settings.pagina_iniziale;
  return PAGINE_DI_AVVIO[scelta] || PAGINE_DI_AVVIO.dashboard;
};
