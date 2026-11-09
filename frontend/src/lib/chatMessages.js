/* Le regole dei messaggi, valide per la farmacia e per il fattorino.

   Erano scritte due volte, una in pages/pharmacy/Chat.jsx e una in
   pages/driver/Chat.jsx: ordinamento, eliminazione dei doppioni e raggruppamento
   per giorno devono essere gli stessi delle due parti, altrimenti lo stesso
   messaggio compare in ordine diverso a seconda di chi guarda.
*/

export const sortMessages = (items = []) =>
  [...items].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

export const dedupeMessages = (items = []) => {
  const seen = new Set();
  return sortMessages(items.filter((item) => {
    if (!item?.message_id || seen.has(item.message_id)) return false;
    seen.add(item.message_id);
    return true;
  }));
};

export const sameDay = (first, second) =>
  new Date(first).toDateString() === new Date(second).toDateString();

export const dayLabel = (dateString, adesso = new Date()) => {
  const date = new Date(dateString);
  const ieri = new Date(adesso);
  ieri.setDate(ieri.getDate() - 1);
  if (date.toDateString() === adesso.toDateString()) return 'Oggi';
  if (date.toDateString() === ieri.toDateString()) return 'Ieri';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
};

export const formatConversationTime = (dateString, adesso = new Date()) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (date.toDateString() === adesso.toDateString()) {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
};

/** L'anteprima della conversazione nella lista, dopo un messaggio nuovo. */
export const buildUpdatedConversation = (conversation, message, isCurrentConversation) => ({
  ...conversation,
  last_message: message.content,
  last_message_at: message.created_at,
  last_sender_type: message.sender_type,
  unread_count: message.sender_type === 'driver' && !isCurrentConversation
    ? (conversation.unread_count || 0) + 1
    : 0,
});
