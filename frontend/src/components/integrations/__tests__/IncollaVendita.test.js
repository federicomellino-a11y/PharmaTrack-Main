import { describe, it, expect } from 'vitest';
import { parametriVendita } from '../IncollaVendita';

describe('parametriVendita', () => {
  it('porta la vendita letta nel modulo rapido, con il pagamento tradotto', () => {
    const p = new URLSearchParams(parametriVendita({
      cliente: 'ROSSI MARIO', codice_fiscale: 'RSSMRA80A01H501U', importo: 18.5, pagamento: 'card', ricette: '2',
    }));
    expect(p.get('customer_name')).toBe('ROSSI MARIO');
    expect(p.get('fiscal_code')).toBe('RSSMRA80A01H501U');
    expect(p.get('amount')).toBe('18.5');
    expect(p.get('payment_method')).toBe('pos');
    expect(p.get('origine')).toBe('incolla');
  });

  it('senza campi resta solo l\'origine', () => {
    expect(parametriVendita({ cliente: null, importo: null })).toBe('origine=incolla');
  });
});
