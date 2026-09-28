/**
 * Spanish CIF (legal entities only). Format: letter + 7 digits + control (digit or letter).
 * credIA only accepts legal entities, so NIF/NIE of natural persons are rejected.
 */
const LETTERS = "ABCDEFGHJNPQRSUVW";
const CONTROL_LETTERS = "JABCDEFGHI";
const LETTER_CONTROL = new Set(["N", "P", "Q", "R", "S", "W"]); // control must be a letter
const DIGIT_CONTROL = new Set(["A", "B", "E", "H"]); // control must be a digit

export function normalizeCif(raw: string): string {
  return raw.toUpperCase().replace(/[\s.-]/g, "");
}

export function isValidCif(raw: string): boolean {
  const cif = normalizeCif(raw);
  const m = /^([A-Z])(\d{7})([0-9A-J])$/.exec(cif);
  if (!m || !LETTERS.includes(m[1])) return false;
  const [, letter, digits, control] = m;

  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) {
      const doubled = d * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += d;
    }
  }
  const controlDigit = (10 - (sum % 10)) % 10;
  const controlLetter = CONTROL_LETTERS[controlDigit];

  if (LETTER_CONTROL.has(letter)) return control === controlLetter;
  if (DIGIT_CONTROL.has(letter)) return control === String(controlDigit);
  return control === String(controlDigit) || control === controlLetter;
}
