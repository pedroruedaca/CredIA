import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANKS, N43_FALLBACK } from "../../content/banks.es.ts";
import { openingMessage, rateLimit, splitStepTokens, suggestions } from "./conversation.ts";
import { REPLACE_MARKER, visibleAnswer } from "./protocol.ts";
import { caseInstructions, stableInstructions, toAssistantContext, type AssistantContext } from "./prompt.ts";

const guide = readFileSync(new URL("../../content/docs-guide.es.md", import.meta.url), "utf8");

// A portal-shaped source that also carries financial data, as a careless caller might pass.
const source = {
  lenderName: "Fondo Ejemplo Capital",
  companyName: "Distribuciones Ejemplo SL",
  actor: "borrower" as const,
  submittedAt: null,
  requestedAmount: 250000,
  requestedTermMonths: 36,
  kpis: [{ key: "ebitda", value: 412345.67, formula: "operating_result + amortisation" }],
  statement: { revenue: 3141592.65, equity: 987654.32 },
  checks: [{ check_key: "cirbe_vs_books", message: "Deuda CIRBE 812.000 € vs libros 640.000 €" }],
  items: [
    { kind: "trial_balance", required: true, state: "done", fix: null, maxAgeDays: null, summary: "Beneficio 123.456 €", files: [{ name: "balance_2025.xlsx" }] },
    { kind: "norma43", required: true, state: "pending", fix: null, maxAgeDays: null },
    { kind: "cirbe", required: true, state: "pending", fix: null, maxAgeDays: null },
    { kind: "tgss_cert", required: true, state: "attention", fix: "El certificado subido es de marzo de 2026. Fondo Ejemplo Capital necesita uno de los últimos 3 meses.", maxAgeDays: 90 },
    { kind: "cuentas_anuales", required: false, state: "pending", fix: null, maxAgeDays: null },
  ],
} as const;

const ctx = toAssistantContext(source as unknown as Parameters<typeof toAssistantContext>[0]);
const prompt = stableInstructions(guide, BANKS, N43_FALLBACK) + "\n\n" + caseInstructions(ctx);

describe("assistant grounding", () => {
  it("copies only whitelisted fields into the context", () => {
    expect(Object.keys(ctx).sort()).toEqual(["actor", "companyName", "items", "lenderName", "submitted"]);
    for (const item of ctx.items) {
      expect(Object.keys(item).sort()).toEqual(["fix", "kind", "maxAgeDays", "required", "state", "step", "title"]);
    }
  });

  it("puts no financial figures, KPIs, checks, request terms or file names in the prompt", () => {
    for (const leak of ["250000", "250.000", "36 meses", "412345", "ebitda", "EBITDA", "3141592", "987654", "812.000", "640.000", "123.456", "balance_2025.xlsx", "cirbe_vs_books"]) {
      expect(prompt).not.toContain(leak);
    }
    expect(prompt).not.toMatch(/\d[\d.]*,\d{2}\s?€/); // no euro amounts
  });

  it("includes the checklist with states, fix messages, rules and valid step kinds", () => {
    const c = caseInstructions(ctx);
    expect(c).toContain("Lender: Fondo Ejemplo Capital");
    expect(c).toContain("Step 4 · doc_kind=tgss_cert");
    expect(c).toContain("hay que revisarlo");
    expect(c).toContain("necesita uno de los últimos 3 meses");
    expect(c).toContain("antigüedad máxima 90 días");
    expect(c).toContain("opcional");
  });

  it("states the hard rules and grounds on the guide and bank steps", () => {
    const s = stableInstructions(guide, BANKS, N43_FALLBACK);
    expect(s).toMatch(/Never discuss the company's finances/);
    expect(s).toMatch(/Never invent URLs/);
    expect(s).toMatch(/\[\[step:<doc_kind>\]\]/);
    expect(s).toContain("Informe CIRBE (cirbe)");
    expect(s).toContain("### Santander");
    expect(s).toContain(N43_FALLBACK);
  });

  it("the stable part does not depend on the case (so it can be cached)", () => {
    expect(stableInstructions(guide, BANKS, N43_FALLBACK)).not.toContain("Fondo Ejemplo Capital");
    expect(stableInstructions(guide, BANKS, N43_FALLBACK)).not.toContain("Distribuciones Ejemplo SL");
  });

  it("tells the model when it is talking to the gestoría", () => {
    const d = toAssistantContext({ ...source, actor: "delegate" } as unknown as Parameters<typeof toAssistantContext>[0]);
    expect(caseInstructions(d)).toMatch(/gestoría/);
  });
});

describe("opening message and chips", () => {
  it("lists missing required items, fixes phrased as what is needed", () => {
    expect(openingMessage(ctx)).toBe(
      "Hola. Te faltan los movimientos bancarios, el informe CIRBE y un certificado de la Seguridad Social más reciente. ¿Por cuál empezamos?",
    );
  });
  it("singular, all done, submitted and empty cases", () => {
    const one: AssistantContext = { ...ctx, items: ctx.items.map((i) => (i.kind === "cirbe" ? i : { ...i, state: "done" as const })) };
    expect(openingMessage(one)).toBe("Hola. Te falta el informe CIRBE. ¿Por cuál empezamos?");
    const done: AssistantContext = { ...ctx, items: ctx.items.map((i) => ({ ...i, state: "done" as const })) };
    expect(openingMessage(done)).toMatch(/Enviar documentación/);
    expect(openingMessage({ ...done, submitted: true })).toMatch(/Ya has enviado/);
    expect(openingMessage({ ...ctx, items: [] })).toMatch(/no hay documentos pendientes/);
  });
  it("suggests why, the first two open required items, and the gestoría route", () => {
    expect(suggestions(ctx)).toEqual(["¿Por qué pedís esto?", "Movimientos bancarios", "Informe CIRBE", "Lo lleva mi gestoría"]);
    expect(suggestions({ ...ctx, actor: "delegate" })).not.toContain("Lo lleva mi gestoría");
  });
});

describe("splitStepTokens", () => {
  const steps = { cirbe: 3, tgss_cert: 4 };
  it("turns known step tokens into links and keeps surrounding text", () => {
    expect(splitStepTokens("Descárgalo y súbelo [[step:cirbe]]. Luego el otro [[step:tgss_cert]]", steps)).toEqual([
      { type: "text", text: "Descárgalo y súbelo " },
      { type: "step", kind: "cirbe", step: 3 },
      { type: "text", text: ". Luego el otro " },
      { type: "step", kind: "tgss_cert", step: 4 },
    ]);
  });
  it("drops tokens for kinds that are not in this checklist", () => {
    expect(splitStepTokens("Ve aquí [[step:modelo200]] ya.", steps)).toEqual([{ type: "text", text: "Ve aquí  ya." }]);
    expect(splitStepTokens("Ve [[step:../admin]]", steps)).toEqual([{ type: "text", text: "Ve [[step:../admin]]" }]);
  });
  it("hides an unfinished token while streaming", () => {
    expect(splitStepTokens("Súbelo [[step:cir", steps)).toEqual([{ type: "text", text: "Súbelo " }]);
    expect(splitStepTokens("Súbelo [[", steps)).toEqual([{ type: "text", text: "Súbelo " }]);
  });
});

describe("rateLimit", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();
  it("allows up to 30 questions per rolling hour", () => {
    expect(rateLimit(Array.from({ length: 29 }, (_, i) => at(i)), now)).toEqual({ allowed: true, remaining: 0 });
    const full = Array.from({ length: 30 }, (_, i) => at(i + 1)); // 1..30 minutes ago
    const r = rateLimit(full, now);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.retryAt.toISOString()).toBe(new Date(now.getTime() + 30 * 60_000).toISOString()); // oldest (30 min ago) expires in 30 min
  });
  it("ignores questions older than the window", () => {
    expect(rateLimit(Array.from({ length: 40 }, (_, i) => at(61 + i)), now).allowed).toBe(true);
  });
});

describe("stream protocol", () => {
  it("replaces a partial answer when the server sends the marker", () => {
    expect(visibleAnswer("Para pedir la CIRBE")).toBe("Para pedir la CIRBE");
    expect(visibleAnswer(`Para pedir la ${REPLACE_MARKER}Con eso no puedo ayudarte.`)).toBe("Con eso no puedo ayudarte.");
  });
});
