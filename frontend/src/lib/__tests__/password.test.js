import { describe, expect, it } from 'vitest';
import { generatePassword } from '../password';

describe('generatePassword', () => {
  it('produce 10 caratteri con almeno una maiuscola, una minuscola, una cifra e un simbolo', () => {
    for (let i = 0; i < 50; i += 1) {
      const pwd = generatePassword();
      expect(pwd).toHaveLength(10);
      expect(pwd).toMatch(/[A-Z]/);
      expect(pwd).toMatch(/[a-z]/);
      expect(pwd).toMatch(/[0-9]/);
      expect(pwd).toMatch(/[!@#$%]/);
    }
  });

  it('non usa caratteri ambigui (0, O, 1, l, I)', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generatePassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('due password consecutive sono diverse', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
  });
});
