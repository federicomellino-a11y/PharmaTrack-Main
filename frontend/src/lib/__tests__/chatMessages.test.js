import { describe, expect, it } from 'vitest';
import {
  buildUpdatedConversation,
  dayLabel,
  dedupeMessages,
  formatConversationTime,
  sameDay,
  sortMessages,
} from '../chatMessages';

const messaggio = (id, quando, extra = {}) => ({
  message_id: id, created_at: quando, content: `testo ${id}`, sender_type: 'pharmacy', ...extra,
});

describe('sortMessages e dedupeMessages', () => {
  it('ordina dal più vecchio al più recente', () => {
    const ordinati = sortMessages([
      messaggio('b', '2026-11-09T10:05:00Z'),
      messaggio('a', '2026-11-09T10:00:00Z'),
    ]);
    expect(ordinati.map((m) => m.message_id)).toEqual(['a', 'b']);
  });

  it('tiene un solo esemplare per message_id', () => {
    const puliti = dedupeMessages([
      messaggio('a', '2026-11-09T10:00:00Z'),
      messaggio('a', '2026-11-09T10:00:00Z'),
      messaggio('b', '2026-11-09T10:01:00Z'),
    ]);
    expect(puliti.map((m) => m.message_id)).toEqual(['a', 'b']);
  });

  it('scarta i messaggi senza identificativo (non sono ancora salvati)', () => {
    expect(dedupeMessages([{ content: 'bozza' }, messaggio('a', '2026-11-09T10:00:00Z')])).toHaveLength(1);
  });

  it('non modifica l array che riceve', () => {
    const originale = [messaggio('b', '2026-11-09T10:05:00Z'), messaggio('a', '2026-11-09T10:00:00Z')];
    sortMessages(originale);
    expect(originale[0].message_id).toBe('b');
  });
});

describe('sameDay e dayLabel', () => {
  it('riconosce lo stesso giorno anche a ore diverse', () => {
    expect(sameDay('2026-11-09T00:30:00', '2026-11-09T23:30:00')).toBe(true);
    expect(sameDay('2026-11-09T23:30:00', '2026-11-10T00:30:00')).toBe(false);
  });

  it('chiama Oggi e Ieri i due giorni vicini, e scrive la data per gli altri', () => {
    const oggi = new Date('2026-11-09T12:00:00');
    expect(dayLabel('2026-11-09T08:00:00', oggi)).toBe('Oggi');
    expect(dayLabel('2026-11-08T08:00:00', oggi)).toBe('Ieri');
    expect(dayLabel('2026-10-31T08:00:00', oggi)).toMatch(/31 ottobre 2026/);
  });
});

describe('formatConversationTime', () => {
  it('mostra l orario per oggi e la data breve per i giorni passati', () => {
    const oggi = new Date('2026-11-09T12:00:00');
    expect(formatConversationTime('2026-11-09T09:30:00', oggi)).toMatch(/09:30|9:30/);
    expect(formatConversationTime('2026-11-06T09:30:00', oggi)).toMatch(/06/);
    expect(formatConversationTime(null)).toBe('');
  });
});

describe('buildUpdatedConversation', () => {
  const conversazione = { conversation_id: 'c1', last_message: 'vecchio', unread_count: 0 };

  it('aggiorna l anteprima con l ultimo messaggio', () => {
    const aggiornata = buildUpdatedConversation(conversazione, messaggio('a', '2026-11-09T10:00:00Z', { sender_type: 'driver', content: 'ciao' }), true);
    expect(aggiornata.last_message).toBe('ciao');
    expect(aggiornata.last_sender_type).toBe('driver');
  });

  it('conta il non letto solo se scrive il fattorino e la chat non è aperta', () => {
    const chiusa = buildUpdatedConversation({ ...conversazione, unread_count: 2 }, messaggio('a', '2026-11-09T10:00:00Z', { sender_type: 'driver' }), false);
    expect(chiusa.unread_count).toBe(3);
    const aperta = buildUpdatedConversation(conversazione, messaggio('a', '2026-11-09T10:00:00Z', { sender_type: 'driver' }), true);
    expect(aperta.unread_count).toBe(0);
  });

  it('azzerra il non letto quando a scrivere è la farmacia', () => {
    const aggiornata = buildUpdatedConversation({ ...conversazione, unread_count: 4 }, messaggio('a', '2026-11-09T10:00:00Z', { sender_type: 'pharmacy' }), false);
    expect(aggiornata.unread_count).toBe(0);
  });
});
