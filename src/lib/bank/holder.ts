/**
 * Whose account is it? credIA only covers companies (legal entities with a CIF): a bank account held by a person must
 * not feed a company's package (wrong figures, and a private individual's data where it does not belong). Pure.
 *
 *   person    the holder's ID is a DNI or NIE → the file is rejected
 *   mismatch  the holder's name is clearly not the company's → its accounts stay out of the figures until the lender
 *             confirms they are the company's (reviewing the `bank_holder_mismatch` check)
 *   match / unknown → used (unknown: no holder printed, or no company name to compare with)
 */
import { companyKey } from "../borme/names.ts";

/** For the company and the lender: a person's account is not accepted. */
export const personalAccountMessage = (name: string) =>
  `«${name}» es de una cuenta personal (el titular tiene DNI o NIE), no de la empresa. Sube solo los movimientos de las cuentas a nombre de la empresa.`;

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** A valid DNI (8 digits + letter) or NIE (X/Y/Z + 7 digits + letter) in the text, normalised; null if none. */
export function personalId(text: string | null | undefined): string | null {
  const s = (text ?? "").toUpperCase().replace(/(?<=\d)[.-](?=\d|[A-Z]\b)/g, ""); // "12.345.678-Z" → "12345678Z"
  for (const m of s.matchAll(/\b([XYZ]?)\s?(\d{7,8})\s?([A-Z])\b/g)) {
    const [, prefix, digits, letter] = m;
    if (prefix ? digits.length !== 7 : digits.length !== 8) continue;
    const n = Number(`${prefix ? "XYZ".indexOf(prefix) : ""}${digits}`);
    if (DNI_LETTERS[n % 23] === letter) return `${prefix}${digits}${letter}`;
  }
  return null;
}

/** Words of a name that identify it, legal forms dropped (as for the BORME). */
const words = (name: string) => companyKey(name).split(" ").filter((w) => w.length > 1);

export type HolderVerdict = "match" | "mismatch" | "unknown";

/**
 * Whether the printed holder is the company. Banks cut and abbreviate holder names (Norma 43 keeps 26 characters), so
 * it matches when every word of the shorter name is in the longer one, the last word allowed to be cut short.
 */
export function holderVerdict(holder: string | null | undefined, companyName: string | null | undefined): HolderVerdict {
  const h = words(holder ?? "");
  const c = words(companyName ?? "");
  if (!h.length || !c.length) return "unknown";
  const [short, long] = h.join(" ").length <= c.join(" ").length ? [h, c] : [c, h];
  const ok = short.every((w, i) => long.includes(w) || (i === short.length - 1 && w.length >= 3 && long.some((l) => l.startsWith(w))));
  return ok ? "match" : "mismatch";
}
