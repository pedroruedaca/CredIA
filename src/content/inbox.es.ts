/** Bandeja copy (Spanish). */
import type { InboxKind } from "@/lib/inbox/build";

export const INBOX_TITLE: Record<InboxKind, (company: string) => string> = {
  support: (c) => `${c} pide hablar con una persona`,
  submitted: (c) => `${c} ha enviado su documentación`,
  consent_withdrawn: (c) => `${c} ha retirado su consentimiento`,
  needs_review: (c) => `Un documento de ${c} necesita revisión`,
  registry: (c) => `Nuevos actos de ${c} en el BORME`,
  purge: (c) => `El caso de ${c} se eliminará pronto`,
};

export const INBOX_TONE: Record<InboxKind, "accent" | "info" | "warn" | "high"> = {
  support: "accent",
  submitted: "info",
  consent_withdrawn: "high",
  needs_review: "warn",
  registry: "info",
  purge: "warn",
};

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  support: "Ayuda",
  submitted: "Enviado",
  consent_withdrawn: "Consentimiento",
  needs_review: "Revisión",
  registry: "BORME",
  purge: "Conservación",
};

export const ACTOR_LABEL = { borrower: "la empresa", delegate: "su gestoría" } as const;
