/* Generazione della password di un fattorino.

   Stava in cima a Drivers.jsx; serve sia alla pagina sia al dialogo di creazione,
   quindi vive qui una volta sola. Garanzia voluta: almeno una maiuscola, una
   minuscola, una cifra e un simbolo, poi sei caratteri a caso, mescolati.
*/
export const generatePassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%';
  const all = upper + lower + digits + special;
  const pwd = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = 0; i < 6; i += 1) pwd.push(all[Math.floor(Math.random() * all.length)]);
  return pwd.sort(() => Math.random() - 0.5).join('');
};

export default generatePassword;
