/** Assistant conversation helpers: opening message, suggestion chips, step links, rate limit. Pure. */
import { ASSISTANT_COPY, CHIP_NAME, FIX_NAME, SHORT_NAME } from "../../content/assistant.es.ts";
import type { RequirementKind } from "../cases/requirements.ts";
import type { AssistantContext } from "./prompt.ts";

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

/** "Hola. Te faltan los movimientos bancarios, el informe CIRBE y un certificado de la Seguridad Social más reciente. ¿Por cuál empezamos?" */
export function openingMessage(ctx: AssistantContext): string {
  const open = ctx.items.filter((i) => i.required && i.state !== "done");
  if (ctx.items.length === 0) return "Hola. Ahora mismo no hay documentos pendientes. Si tienes cualquier duda sobre el portal, pregúntame.";
  if (open.length === 0) {
    return ctx.submitted
      ? "Hola. Ya has enviado la documentación. Si te piden algo más o tienes dudas sobre algún documento, pregúntame."
      : "Hola. Ya tienes todos los documentos obligatorios: puedes pulsar «Enviar documentación». Si tienes dudas sobre alguno, pregúntame.";
  }
  const names = open.map((i) => (i.state === "attention" ? FIX_NAME[i.kind] : SHORT_NAME[i.kind]));
  return `Hola. Te ${open.length === 1 ? "falta" : "faltan"} ${list(names)}. ¿Por cuál empezamos?`;
}

/** Up to four chips: why we ask, the first two open items, and the gestoría route for the company itself. */
export function suggestions(ctx: AssistantContext): string[] {
  const open = ctx.items.filter((i) => i.state !== "done").sort((a, b) => Number(b.required) - Number(a.required));
  const chips = [ASSISTANT_COPY.whyChip, ...open.slice(0, 2).map((i) => CHIP_NAME[i.kind])];
  if (ctx.actor === "borrower" && open.length > 0) chips.push(ASSISTANT_COPY.gestoriaChip);
  return chips;
}

export type Segment = { type: "text"; text: string } | { type: "step"; kind: RequirementKind; step: number };

const STEP_TOKEN = /\[\[step:([a-z0-9_]+)\]\]/g;

/**
 * Splits assistant text into plain text and step links. Unknown kinds are dropped (never rendered as a link),
 * and an unfinished token at the end of a streaming chunk is hidden until it completes.
 */
export function splitStepTokens(text: string, steps: Partial<Record<string, number>>): Segment[] {
  const out: Segment[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = out.at(-1);
    if (last?.type === "text") last.text += t;
    else out.push({ type: "text", text: t });
  };

  const partial = text.lastIndexOf("[[");
  const body = partial >= 0 && !text.slice(partial).includes("]]") ? text.slice(0, partial) : text;

  let at = 0;
  for (const m of body.matchAll(STEP_TOKEN)) {
    pushText(body.slice(at, m.index));
    const step = steps[m[1]];
    if (step) out.push({ type: "step", kind: m[1] as RequirementKind, step });
    at = m.index! + m[0].length;
  }
  pushText(body.slice(at));
  return out;
}

export const RATE_LIMIT = { max: 30, windowMs: 60 * 60 * 1000 };

/** Given the times of this link holder's recent questions, may they ask another? */
export function rateLimit(recent: readonly string[], now = new Date(), limit = RATE_LIMIT) {
  const since = now.getTime() - limit.windowMs;
  const inWindow = recent.map((t) => new Date(t).getTime()).filter((t) => t > since).sort((a, b) => a - b);
  if (inWindow.length < limit.max) return { allowed: true as const, remaining: limit.max - inWindow.length - 1 };
  const retryAt = new Date(inWindow[inWindow.length - limit.max] + limit.windowMs);
  return { allowed: false as const, retryAt };
}
