import { describe, expect, it } from 'vitest';
import { avanzamentoFarmacia, prossimaAzione, statoSuccessivo } from '../deliveryActions';

describe('statoSuccessivo', () => {
  it('la farmacia percorre le sei fasi in ordine', () => {
    expect(statoSuccessivo('da_preparare')).toBe('pronta');
    expect(statoSuccessivo('pronta')).toBe('assigned');
    expect(statoSuccessivo('assigned')).toBe('picked_up');
    expect(statoSuccessivo('picked_up')).toBe('in_transit');
    expect(statoSuccessivo('in_transit')).toBe('delivered_pending_confirmation');
    expect(statoSuccessivo('delivered_pending_confirmation')).toBe('delivered');
  });

  it('il doppione pending si comporta come da preparare', () => {
    expect(statoSuccessivo('pending')).toBe(statoSuccessivo('da_preparare'));
  });

  it('le consegne chiuse non hanno un passo successivo', () => {
    for (const stato of ['delivered', 'cancelled', 'not_delivered', 'inventato', undefined]) {
      expect(statoSuccessivo(stato)).toBeNull();
    }
  });

  it('il fattorino ha una catena piu corta', () => {
    expect(statoSuccessivo('assigned', 'fattorino')).toBe('picked_up');
    expect(statoSuccessivo('picked_up', 'fattorino')).toBe('in_transit');
    expect(statoSuccessivo('in_transit', 'fattorino')).toBe('delivered');
    // non gli compete la conferma dell'incasso
    expect(statoSuccessivo('delivered_pending_confirmation', 'fattorino')).toBeNull();
    expect(statoSuccessivo('pronta', 'fattorino')).toBeNull();
  });
});

describe('prossimaAzione', () => {
  it('dice lo stato e la parola del pulsante', () => {
    expect(prossimaAzione('da_preparare')).toEqual({ stato: 'pronta', etichetta: 'Segna pronta' });
    expect(prossimaAzione('assigned', 'fattorino')).toEqual({ stato: 'picked_up', etichetta: 'Ritira' });
    expect(prossimaAzione('in_transit', 'fattorino')).toEqual({ stato: 'delivered', etichetta: 'Consegnato' });
  });

  it('non inventa un pulsante dove non c e un passo', () => {
    expect(prossimaAzione('delivered')).toBeNull();
    expect(prossimaAzione('cancelled', 'fattorino')).toBeNull();
  });

  it('usa l etichetta di fase quando non c e una parola d azione', () => {
    const azione = prossimaAzione('in_transit');
    expect(azione.stato).toBe('delivered_pending_confirmation');
    expect(azione.etichetta).toBe('Conferma incasso');
  });
});

describe('avanzamentoFarmacia', () => {
  it('da affidata va direttamente in giro, come fa il banco', () => {
    expect(avanzamentoFarmacia('assigned')).toEqual({ stato: 'in_transit', etichetta: 'In consegna' });
    expect(avanzamentoFarmacia('picked_up')).toEqual({ stato: 'in_transit', etichetta: 'In consegna' });
  });

  it("l'ultimo passo porta in attesa di incasso, non a incassata", () => {
    expect(avanzamentoFarmacia('in_transit')).toEqual({
      stato: 'delivered_pending_confirmation',
      etichetta: 'Consegnata da incassare',
    });
  });

  it('non avanza una consegna ferma', () => {
    for (const stato of ['da_preparare', 'pronta', 'delivered', 'cancelled', 'not_delivered', undefined]) {
      expect(avanzamentoFarmacia(stato)).toBeNull();
    }
  });
});
