/**
 * AES-256-GCM for third-party credentials (Holded API keys) at rest.
 * Key: CREDIA_ENCRYPTION_KEY = 32 random bytes, base64 (`openssl rand -base64 32`). Server-only.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Sealed { ciphertext: Buffer; iv: Buffer; tag: Buffer }

function key(): Buffer {
  const raw = process.env.CREDIA_ENCRYPTION_KEY;
  if (!raw) throw new Error("CREDIA_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("CREDIA_ENCRYPTION_KEY must decode to 32 bytes");
  return k;
}

/** `aad` binds the ciphertext to its row (e.g. the connection id) so it cannot be swapped between cases. */
export function seal(plaintext: string, aad: string): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return { ciphertext, iv, tag: c.getAuthTag() };
}

export function open(s: Sealed, aad: string): string {
  const d = createDecipheriv("aes-256-gcm", key(), s.iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(s.tag);
  return Buffer.concat([d.update(s.ciphertext), d.final()]).toString("utf8");
}
