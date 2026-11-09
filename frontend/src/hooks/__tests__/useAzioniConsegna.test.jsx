// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const post = vi.fn();
const put = vi.fn();
const successo = vi.fn();
const errore = vi.fn();
const confirmAction = vi.fn();

vi.mock('axios', () => ({
  default: {
    post: (...a) => post(...a),
    put: (...a) => put(...a),
    interceptors: { response: { use: () => {} } },
  },
}));
vi.mock('sonner', () => ({ toast: { success: (...a) => successo(...a), error: (...a) => errore(...a) } }));
vi.mock('../../components/ConfirmDialog', () => ({ confirmAction: (...a) => confirmAction(...a) }));

import useAzioniConsegna from '../useAzioniConsegna';

const consegna = {
  delivery_id: 'd-1',
  customer_name: 'Anna Verdi',
  amount: 12.5,
  status: 'delivered_pending_confirmation',
  driver_id: 'drv-1',
};

const prepara = (opzioni = {}) => {
  const ricarica = vi.fn();
  const onAssegnaRichiesta = vi.fn();
  const { result } = renderHook(() => useAzioniConsegna({ ricarica, onAssegnaRichiesta, ...opzioni }));
  return { azioni: result.current, ricarica, onAssegnaRichiesta };
};

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} });
  put.mockReset().mockResolvedValue({ data: {} });
  successo.mockReset();
  errore.mockReset();
  confirmAction.mockReset().mockResolvedValue(true);
  vi.stubGlobal('prompt', vi.fn(() => 'nota libera'));
});

describe('confermaIncasso', () => {
  it('manda l’importo della consegna e la nota scritta, poi ricarica', async () => {
    const { azioni, ricarica } = prepara();
    await act(() => azioni.confermaIncasso(consegna));

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/deliveries/d-1/confirm-payment'),
      { confirmed_amount: 12.5, note: 'nota libera' },
      { withCredentials: true }
    );
    expect(ricarica).toHaveBeenCalledTimes(1);
    expect(successo).toHaveBeenCalled();
  });

  it('non manda nulla e non ricarica se la farmacia annulla il dialogo', async () => {
    vi.stubGlobal('prompt', vi.fn(() => null));
    const { azioni, ricarica } = prepara();
    await act(() => azioni.confermaIncasso(consegna));

    expect(post).not.toHaveBeenCalled();
    expect(ricarica).not.toHaveBeenCalled();
    expect(successo).not.toHaveBeenCalled();
  });

  it('manda note null quando il campo resta vuoto', async () => {
    vi.stubGlobal('prompt', vi.fn(() => ''));
    const { azioni } = prepara();
    await act(() => azioni.confermaIncasso(consegna));

    expect(post.mock.calls[0][1]).toEqual({ confirmed_amount: 12.5, note: null });
  });

  it('se il backend rifiuta mostra il motivo e non ricarica', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { detail: 'Incasso già confermato' } } });
    const { azioni, ricarica } = prepara();
    await act(() => azioni.confermaIncasso(consegna));

    expect(errore).toHaveBeenCalledWith('Incasso già confermato');
    expect(ricarica).not.toHaveBeenCalled();
  });
});

describe('contestaIncasso', () => {
  it('esige un motivo vero: solo spazi non contesta', async () => {
    vi.stubGlobal('prompt', vi.fn(() => '   '));
    const { azioni, ricarica } = prepara();
    await act(() => azioni.contestaIncasso(consegna));

    expect(post).not.toHaveBeenCalled();
    expect(ricarica).not.toHaveBeenCalled();
  });

  it('manda il motivo ripulito dagli spazi', async () => {
    vi.stubGlobal('prompt', vi.fn(() => '  mancano 5 euro  '));
    const { azioni, ricarica } = prepara();
    await act(() => azioni.contestaIncasso(consegna));

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/deliveries/d-1/dispute-payment'),
      { reason: 'mancano 5 euro' },
      { withCredentials: true }
    );
    expect(ricarica).toHaveBeenCalledTimes(1);
  });
});

describe('annulla', () => {
  it('se la conferma viene rifiutata non tocca il backend', async () => {
    confirmAction.mockResolvedValue(false);
    const { azioni, ricarica } = prepara();
    await act(() => azioni.annulla('d-1'));

    expect(put).not.toHaveBeenCalled();
    expect(ricarica).not.toHaveBeenCalled();
  });

  it('confermando manda lo stato annullato e ricarica', async () => {
    const { azioni, ricarica } = prepara();
    await act(() => azioni.annulla('d-1'));

    expect(put).toHaveBeenCalledWith(
      expect.stringContaining('/deliveries/d-1'),
      { status: 'cancelled' },
      { withCredentials: true }
    );
    expect(ricarica).toHaveBeenCalledTimes(1);
  });
});

describe('ripristina', () => {
  it('riporta a nuova la consegna chiesta al backend', async () => {
    const { azioni, ricarica } = prepara();
    await act(() => azioni.ripristina('d-1'));

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/deliveries/d-1/restore'),
      {},
      { withCredentials: true }
    );
    expect(ricarica).toHaveBeenCalledTimes(1);
  });

  it('mostra il motivo del rifiuto invece di un errore generico', async () => {
    post.mockRejectedValue({ response: { data: { detail: 'La consegna non è in archivio' } } });
    const { azioni } = prepara();
    await act(() => azioni.ripristina('d-1'));

    expect(errore).toHaveBeenCalledWith('La consegna non è in archivio');
  });
});

describe('avanzaStato', () => {
  it('senza fattorino non avvia: chiede di assegnarlo', async () => {
    const { azioni, ricarica, onAssegnaRichiesta } = prepara();
    await act(() => azioni.avanzaStato({ ...consegna, status: 'assigned', driver_id: null }));

    expect(put).not.toHaveBeenCalled();
    expect(errore).toHaveBeenCalledWith('Assegna prima un fattorino per avviare la consegna');
    expect(onAssegnaRichiesta).toHaveBeenCalledTimes(1);
    expect(ricarica).not.toHaveBeenCalled();
  });

  it('con il fattorino passa a in consegna', async () => {
    const { azioni, ricarica } = prepara();
    await act(() => azioni.avanzaStato({ ...consegna, status: 'assigned' }));

    expect(put).toHaveBeenCalledWith(
      expect.stringContaining('/deliveries/d-1'),
      { status: 'in_transit' },
      { withCredentials: true }
    );
    expect(ricarica).toHaveBeenCalledTimes(1);
  });

  it('non fa nulla su uno stato che la farmacia non può avanzare', async () => {
    const { azioni, ricarica } = prepara();
    await act(() => azioni.avanzaStato({ ...consegna, status: 'delivered' }));

    expect(put).not.toHaveBeenCalled();
    expect(ricarica).not.toHaveBeenCalled();
  });
});
