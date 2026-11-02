// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * I log di Google in console dicevano che initialize() veniva chiamata piu'
 * volte. Questi test bloccano quella regressione: initialize deve essere una
 * sola per client id, e cambiare la callback non deve reinizializzare.
 */
const initialize = vi.fn();
const prompt = vi.fn();

const loadModule = async () => {
  vi.resetModules();
  window.google = { accounts: { id: { initialize, prompt } } };
  return import('../googleAuth');
};

const credenziale = { credential: 'token-finto' };

describe('googleAuth', () => {
  beforeEach(() => {
    initialize.mockReset();
    prompt.mockReset();
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ client_id: 'client-di-prova.apps.googleusercontent.com' }) }));
  });

  afterEach(() => {
    delete window.google;
    vi.restoreAllMocks();
  });

  it('inizializza una volta sola anche se la libreria viene caricata piu volte', async () => {
    const mod = await loadModule();
    await mod.loadGoogleSignIn();
    await mod.loadGoogleSignIn();
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('passa use_fedcm_for_prompt per non restare indietro su FedCM', async () => {
    const mod = await loadModule();
    await mod.loadGoogleSignIn();
    const config = initialize.mock.calls[0][0];
    expect(config.use_fedcm_for_prompt).toBe(true);
    expect(config.client_id).toContain('apps.googleusercontent.com');
  });

  it('cambiare la callback non reinizializza e usa il nuovo gestore', async () => {
    const mod = await loadModule();
    await mod.loadGoogleSignIn();
    const primo = vi.fn();
    const secondo = vi.fn();
    mod.setGoogleCredentialCallback(primo);
    mod.setGoogleCredentialCallback(secondo);

    expect(initialize).toHaveBeenCalledTimes(1);

    const callback = initialize.mock.calls[0][0].callback;
    callback(credenziale);
    expect(primo).not.toHaveBeenCalled();
    expect(secondo).toHaveBeenCalledWith('token-finto');
  });

  it('legge il client id dal backend, non dalla variabile del build', async () => {
    const mod = await loadModule();
    await mod.loadGoogleSignIn();
    expect(mod.currentClientId()).toBe('client-di-prova.apps.googleusercontent.com');
  });
});
