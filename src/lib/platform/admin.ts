/**
 * Platform administration (credIA's own staff, not a lender role). Pure.
 *
 * Who may administer the platform is not stored in the database: it is the list of emails in CREDIA_ADMIN_EMAILS
 * (comma or space separated), set in Vercel. Empty or unset = nobody. The admin page creates lenders and their first
 * owner; everything inside a lender (its team, cases, settings) stays with the lender's owners.
 */
import { z } from "zod";

/** The admin emails from the environment value, lowercased. */
export const adminEmails = (raw: string | undefined): string[] =>
  (raw ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));

export const isPlatformAdmin = (email: string | null | undefined, raw: string | undefined = process.env.CREDIA_ADMIN_EMAILS): boolean =>
  !!email && adminEmails(raw).includes(email.trim().toLowerCase());

const NewLender = z.object({
  name: z.string().min(2, "Escribe el nombre de la entidad.").max(120, "Máximo 120 caracteres."),
  ownerEmail: z.string().email("Escribe un correo válido.").max(254),
});

export type NewLenderErrors = Partial<Record<"name" | "ownerEmail", string>>;

/** The «Nueva entidad» form: entity name and its first owner's email. */
export function parseNewLender(v: Record<string, string | undefined>): { ok: true; data: { name: string; ownerEmail: string } } | { ok: false; errors: NewLenderErrors } {
  const r = NewLender.safeParse({ name: (v.name ?? "").trim().replace(/\s+/g, " "), ownerEmail: (v.ownerEmail ?? "").trim().toLowerCase() });
  if (r.success) return { ok: true, data: r.data };
  const errors: NewLenderErrors = {};
  for (const i of r.error.issues) {
    const k = i.path[0] as keyof NewLenderErrors;
    errors[k] ??= i.message;
  }
  return { ok: false, errors };
}
