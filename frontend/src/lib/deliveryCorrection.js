/* La correzione manuale dello stato di una consegna, fatta dalla farmacia.

   La sequenza normale la decide il backend (delivery_lifecycle.TRANSIZIONI): qui
   si costruisce solo il pezzo di richiesta che corregge uno stato fuori
   sequenza. Il motivo e' la differenza fra una correzione e un pasticcio: senza
   motivo il backend risponde 409 spiegando quali stati sono ammessi, e la
   farmacia lo legge nel messaggio d'errore.
*/

export const pulisciMotivo = (motivo) => (motivo || '').trim().slice(0, 200);

export const costruisciCorrezioneStato = (consegna, statoScelto, motivo) => {
  const statoAttuale = consegna?.status;
  const nuovo = statoScelto || statoAttuale;
  if (!nuovo || nuovo === statoAttuale) return {};
  const pulito = pulisciMotivo(motivo);
  return pulito
    ? { status: nuovo, force: true, force_reason: pulito }
    : { status: nuovo };
};

export default costruisciCorrezioneStato;
