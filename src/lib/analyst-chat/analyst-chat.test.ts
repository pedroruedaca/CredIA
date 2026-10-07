import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { caseViewSample } from "../__fixtures__/case-view-sample.ts";
import { n43BankA, n43BankB, TWO_BANKS_COMPANY } from "../__fixtures__/n43-two-banks.ts";
import { classifyAccounts } from "../bank/classify.ts";
import { buildPackage } from "../case-view/package.ts";
import { parseNorma43 } from "../parsers/norma43.ts";
import { evaluate } from "./calc.ts";
import { fromEditable, prepareConclusion, toEditable } from "./conclusions.ts";
import { chatSuggestions } from "./conversation.ts";
import { caseSnapshot, stableInstructions } from "./prompt.ts";
import { applyEvent, decodeEvents, emptyAnswer, encodeEvent, type ChatEvent } from "./protocol.ts";
import { footnoted, RefRegistry, refHandle, splitCitations, validateAnswer, type Citation } from "./refs.ts";
import { runTurn, type StreamingClient } from "./run.ts";
import { runTool, toolDefinitions, TOOL_SCHEMAS, type BankRow, type ToolContext } from "./tools.ts";

// The two-bank Norma 43 fixture as the pipeline stores it in bank_transactions (classified, own accounts).
const bankRows: BankRow[] = classifyAccounts(parseNorma43(n43BankA + n43BankB, { docId: "n1" }).data, { companyName: TWO_BANKS_COMPANY }).flatMap((a) =>
  a.transactions.map((t) => ({ booking_date: t.bookingDate, amount: t.amount, description: t.description, category: t.category ?? null, iban_masked: a.accountMasked, source_ref: t.sourceRef })),
);

const data = caseViewSample;
const pkg = buildPackage(data);
const makeCtx = (rows: BankRow[] = bankRows): ToolContext => ({ data, pkg, registry: new RefRegistry(), bankRows: async () => rows });
type Result = Record<string, unknown>;
const ok = async (ctx: ToolContext, name: string, input: unknown = {}) => {
  const r = await runTool(ctx, name, input);
  if (!r.ok) throw new Error(r.error);
  return r.result as Result;
};

describe("citation handles and validation", () => {
  it("handles are short, stable and distinct", () => {
    expect(refHandle("kpi:closed_fy:ebitda")).toMatch(/^r[a-z0-9]{8}$/);
    expect(refHandle("kpi:closed_fy:ebitda")).toBe(refHandle("kpi:closed_fy:ebitda"));
    expect(refHandle("kpi:closed_fy:ebitda")).not.toBe(refHandle("kpi:ytd:ebitda"));
  });

  it("keeps known citations, drops invented ones and flags figures without a source", () => {
    const reg = new RefRegistry();
    const h = reg.add({ id: "kpi:closed_fy:ebitda", label: "EBITDA · cierre 2025", value: 182400, unit: "EUR" });
    const v = validateAnswer(
      `El EBITDA fue de 182.400 € [[ref:${h}]]. La deuda es 95.000 € [[ref:rzzzzzzzz]].\n- Cuenta 430 revisada el 31/12/2025, en los últimos 12 meses.\n- Margen del 12,5 %.`,
      reg,
    );
    expect(v.text).not.toContain("rzzzzzzzz");
    expect(v.citations).toEqual([{ h, label: "EBITDA · cierre 2025", sourceRef: null, href: null }]);
    // The debt lost its invented citation, the margin never had one; an account code and a date are not figures.
    expect(v.uncited).toEqual(["La deuda es 95.000 €.", "Margen del 12,5 %."]);
  });

  it("numbers citations by first appearance and hides an unfinished token while streaming", () => {
    const a: Citation = { h: "raaaaaaaa", label: "A", sourceRef: "doc:1:page:2", href: "/x" };
    const b: Citation = { h: "rbbbbbbbb", label: "B", sourceRef: null, href: null };
    const segs = splitCitations("x [[ref:rbbbbbbbb]] y [[ref:raaaaaaaa]] z [[ref:rbbbbbbbb]] [[ref:rcc", [a, b]);
    expect(segs.filter((s) => s.type === "cite").map((s) => (s.type === "cite" ? `${s.n}${s.citation.label}` : ""))).toEqual(["1B", "2A", "1B"]);
    expect(segs.at(-1)).toEqual({ type: "text", text: " " });
    expect(footnoted("Ventas 10 € [[ref:raaaaaaaa]] y **20 €** [[ref:rbbbbbbbb]].", [a, b])).toEqual({
      text: "Ventas 10 € [1] y 20 € [2].",
      notes: [{ ...a, n: 1 }, { ...b, n: 2 }],
    });
  });
});

describe("compute arithmetic", () => {
  it("follows precedence, parentheses and unary minus", () => {
    expect(evaluate("(a - b) / b * 100", { a: 120, b: 100 })).toEqual({ ok: true, value: 20 });
    expect(evaluate("-a + 2 * -b", { a: 1, b: 3 })).toEqual({ ok: true, value: -7 });
    expect(evaluate("a / 12 * 12", { a: 36 })).toEqual({ ok: true, value: 36 });
  });
  it("rejects anything that is not arithmetic over the given operands", () => {
    expect(evaluate("a / b", { a: 1, b: 0 })).toMatchObject({ ok: false, error: "división por cero" });
    expect(evaluate("a + c", { a: 1 })).toMatchObject({ ok: false });
    expect(evaluate("process.exit(1)", {})).toMatchObject({ ok: false });
    expect(evaluate("a; b", { a: 1, b: 2 })).toMatchObject({ ok: false });
    expect(evaluate("(a + 1", { a: 1 })).toMatchObject({ ok: false });
  });
});

describe("tools", () => {
  it("are offered with plain JSON schemas, in a fixed order", () => {
    const defs = toolDefinitions();
    expect(defs.map((d) => d.name)).toEqual(Object.keys(TOOL_SCHEMAS));
    for (const d of defs) {
      expect(d.input_schema.type).toBe("object");
      expect(d.input_schema).not.toHaveProperty("$schema");
    }
    expect(JSON.stringify(toolDefinitions())).toBe(JSON.stringify(defs)); // byte-stable: part of the cached prefix
  });

  it("statement lines carry refs whose values are the statement's", async () => {
    const ctx = makeCtx();
    const r = await ok(ctx, "get_statements", { period: "closed_fy", section: "pnl", with_accounts: true });
    const revenue = (r.pnl as { line: string; values: Record<string, { value: number; ref: string }>; accounts: Record<string, { ref: string; account: string }[]> }[]).find((l) => l.line === "revenue")!;
    expect(revenue.values.closed_fy.value).toBe(data.statements.closed!.incomeStatement.revenue);
    expect(ctx.registry.get(revenue.values.closed_fy.ref)).toMatchObject({ value: data.statements.closed!.incomeStatement.revenue, unit: "EUR" });
    // The accounts behind the line point at the trial balance.
    const acct = revenue.accounts.closed_fy[0];
    expect(ctx.registry.citation(acct.ref)).toMatchObject({ sourceRef: expect.stringMatching(/^doc:|^tb:|^holded:|:row:/) });
  });

  it("KPIs come with formula, inputs and a ref; bank KPIs too", async () => {
    const ctx = makeCtx();
    const r = await ok(ctx, "get_kpis", { period: "all" });
    const closed = (r.closed_fy as { kpis: { key: string; value: number | null; ref: string | null; formula: string }[] }).kpis;
    const ebitda = closed.find((k) => k.key === "ebitda")!;
    expect(ebitda.formula).toBeTruthy();
    expect(ctx.registry.get(ebitda.ref!)!.value).toBe(data.kpis.closed.find((k) => k.key === "ebitda")!.value);
    expect((r.bank as { kpis: unknown[] }).kpis.length).toBe(data.bank!.kpis.length);
  });

  it("checks link to their evidence and sources", async () => {
    const ctx = makeCtx();
    const r = await ok(ctx, "get_checks", { status: "open" });
    const open = r.open as { id: string; ref: string; review: unknown; sources: { ref: string }[] }[];
    expect(open.length).toBe(pkg.open.length);
    expect(ctx.registry.citation(open[0].ref)!.href).toBe(`/casos/${data.kase.id}?check=${encodeURIComponent(open[0].id)}`);
    expect(r.passed).toBeUndefined();
  });

  it("bank aggregates add up to the movements, and own transfers can be left out", async () => {
    const ctx = makeCtx();
    const byMonth = await ok(ctx, "aggregate_bank_movements", { group_by: "month" });
    const groups = byMonth.groups as { key: string; net: { value: number; ref: string }; inflows: { value: number } }[];
    const net = groups.reduce((s, g) => s + g.net.value, 0);
    expect(net).toBeCloseTo(bankRows.reduce((s, r) => s + r.amount, 0), 2);
    expect(ctx.registry.get(groups[0].net.ref)!.label).toContain("todos los movimientos");

    const noOwn = await ok(ctx, "aggregate_bank_movements", { group_by: "none", direction: "in", exclude_categories: ["internal_transfer"] });
    const expected = bankRows.filter((r) => r.amount > 0 && r.category !== "internal_transfer").reduce((s, r) => s + r.amount, 0);
    expect((noOwn.groups as { inflows: { value: number } }[])[0].inflows.value).toBeCloseTo(expected, 2);
  });

  it("searches movements with a cap, a total and each row's source", async () => {
    const ctx = makeCtx();
    const r = await ok(ctx, "search_bank_movements", { direction: "out", order: "abs_desc", limit: 3 });
    const rows = r.rows as { amount: number; ref: string; concept_untrusted: string | null }[];
    const outs = bankRows.filter((x) => x.amount < 0);
    expect(r.matched).toBe(outs.length);
    expect(rows).toHaveLength(Math.min(3, outs.length));
    expect(Math.abs(rows[0].amount)).toBe(Math.max(...outs.map((x) => Math.abs(x.amount))));
    expect(ctx.registry.citation(rows[0].ref)!.sourceRef).toMatch(/^doc:n1:/);
    expect(await ok(makeCtx([]), "search_bank_movements", {})).toHaveProperty("note");
  });

  it("CIRBE positions and totals carry their page", async () => {
    const ctx = makeCtx();
    const r = await ok(ctx, "get_debt_positions");
    const totals = r.totals as { drawn: { value: number; ref: string } };
    expect(totals.drawn.value).toBe(245_000);
    expect(ctx.registry.citation(totals.drawn.ref)).toMatchObject({ sourceRef: "doc:c1:page:2", href: `/casos/${data.kase.id}/documentos/c1?pagina=2` });
  });

  it("say when there is nothing: registry not confirmed, no solvency report", async () => {
    expect(await ok(makeCtx(), "get_registry")).toMatchObject({ confirmed: false });
    expect(await ok(makeCtx(), "get_solvency_report")).toHaveProperty("note");
  });

  it("compute works only over figures a tool returned, and registers the result with its derivation", async () => {
    const ctx = makeCtx();
    const debt = (await ok(ctx, "get_debt_positions")).totals as { drawn: { ref: string } };
    const kpis = (await ok(ctx, "get_kpis", { period: "closed_fy" })).closed_fy as { kpis: { key: string; ref: string | null }[] };
    const ebitdaRef = kpis.kpis.find((k) => k.key === "ebitda")!.ref!;
    const r = await ok(ctx, "compute", { expression: "d / e", operands: { d: debt.drawn.ref, e: ebitdaRef }, label: "Deuda CIRBE / EBITDA", unit: "x" });
    const ebitda = data.kpis.closed.find((k) => k.key === "ebitda")!.value!;
    expect(r.value).toBeCloseTo(245_000 / ebitda, 3);
    expect(ctx.registry.get(r.ref as string)!.label).toContain("Deuda CIRBE / EBITDA");

    expect(await runTool(ctx, "compute", { expression: "a * 2", operands: { a: "rnotthere" }, label: "x", unit: "x" })).toMatchObject({ ok: false });
    const checkRef = ((await ok(ctx, "get_checks")).open as { ref: string }[])[0].ref;
    expect(await runTool(ctx, "compute", { expression: "a * 2", operands: { a: checkRef }, label: "x", unit: "x" })).toMatchObject({ ok: false, error: expect.stringContaining("no es una cifra") });
  });

  it("bad input is an error for the model, never an exception", async () => {
    expect(await runTool(makeCtx(), "get_kpis", { period: "next_year" })).toMatchObject({ ok: false });
    expect(await runTool(makeCtx(), "search_bank_movements", { limit: 5000 })).toMatchObject({ ok: false });
    expect(await runTool(makeCtx(), "drop_tables", {})).toMatchObject({ ok: false });
  });
});

describe("prompt", () => {
  it("forbids scoring and recommendations and requires a citation for every figure", () => {
    const p = stableInstructions();
    expect(p).toMatch(/never score|never scores/i);
    expect(p).toContain("approve/decline");
    expect(p).toContain("[[ref:<ref>]]");
    expect(p).toMatch(/Never do arithmetic yourself/);
    expect(p).toMatch(/_untrusted/);
  });

  it("the snapshot says what the case has, and registers the only figure it carries", () => {
    const reg = new RefRegistry();
    const s = caseSnapshot(data, pkg, reg, "2026-10-07");
    expect(s).toContain(data.kase.companyName);
    expect(s).toContain("CIRBE: as of 2025-12-31, 4 positions");
    expect(s).toContain("not confirmed by the analyst");
    expect(reg.get(refHandle("case:amount"))).toMatchObject({ value: 250_000 });
    expect(s).not.toMatch(/EBITDA.*\d/); // no figures beyond the request
  });

  it("suggests questions this case can answer", () => {
    const q = chatSuggestions(data, pkg);
    expect(q.length).toBeGreaterThan(0);
    expect(q.length).toBeLessThanOrEqual(4);
    expect(q.some((s) => /CIRBE/.test(s))).toBe(true);
  });
});

describe("conclusions", () => {
  const c: Citation = { h: "raaaaaaaa", label: "EBITDA · cierre 2025", sourceRef: null, href: null };
  it("keep only the answer's citations and refuse figures without a source", () => {
    expect(prepareConclusion("EBITDA 182.400 € [[ref:raaaaaaaa]] y [[ref:rforeign1]].", [c])).toEqual({ ok: true, text: "EBITDA 182.400 € [[ref:raaaaaaaa]] y.", citations: [c] });
    expect(prepareConclusion("EBITDA de 200.000 €, según la empresa.", [c])).toMatchObject({ ok: false, reason: "uncited" });
    expect(prepareConclusion("   ", [c])).toMatchObject({ ok: false, reason: "empty" });
  });
  it("are edited with numbered markers and turned back into citations", () => {
    const original = "EBITDA 182.400 € [[ref:raaaaaaaa]].";
    const editable = toEditable(original, [c]);
    expect(editable).toBe("EBITDA 182.400 € [1].");
    expect(fromEditable("El EBITDA del cierre es 182.400 € [1] (ver [7]).", original, [c])).toBe("El EBITDA del cierre es 182.400 € [[ref:raaaaaaaa]] (ver [7]).");
  });
});

describe("stream protocol", () => {
  it("decodes complete lines and keeps the unfinished rest", () => {
    const a = encodeEvent({ t: "delta", text: "Hola" });
    const b = encodeEvent({ t: "status", labels: ["Calculando"] });
    const { events, rest } = decodeEvents(a + b + b.slice(0, 5));
    expect(events).toEqual([{ t: "delta", text: "Hola" }, { t: "status", labels: ["Calculando"] }]);
    expect(rest).toBe(b.slice(0, 5));
  });
  it("a status clears the preamble; done replaces the streamed text", () => {
    let s = emptyAnswer();
    for (const e of [
      { t: "delta", text: "Voy a mirar" },
      { t: "status", labels: ["Leyendo los indicadores"] },
      { t: "delta", text: "El EBITDA" },
      { t: "done", id: 7, text: "El EBITDA fue X [[ref:raaaaaaaa]].", citations: [], uncited: [] },
    ] as ChatEvent[]) s = applyEvent(s, e);
    expect(s).toMatchObject({ id: 7, done: true, status: null, text: "El EBITDA fue X [[ref:raaaaaaaa]]." });
  });
});

// ------------------------------------------------------------------------------------------------ the loop

type Block = Anthropic.Beta.Messages.BetaContentBlock;
/** A scripted Messages API: each call returns the next scripted message, streaming its text. */
function fakeClient(script: ((params: Record<string, unknown>) => { content: Block[]; stop_reason: string })[]) {
  const calls: Record<string, unknown>[] = [];
  const client: StreamingClient = {
    beta: {
      messages: {
        stream(params) {
          const p = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
          calls.push(p);
          const msg = script[calls.length - 1](p);
          const events = msg.content.flatMap((b, index) => (b.type === "text" ? [{ type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } }] : []));
          return {
            async *[Symbol.asyncIterator]() {
              for (const e of events) yield e as Anthropic.Beta.Messages.BetaRawMessageStreamEvent;
            },
            finalMessage: async () => ({ ...msg, id: "m", type: "message", role: "assistant", model: "fake", usage: {} }) as unknown as Anthropic.Beta.Messages.BetaMessage,
            abort() {},
          };
        },
      },
    },
  };
  return { client, calls };
}

const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Block;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Block;

describe("a question, end to end with a scripted model", () => {
  it("runs the tools, feeds the results back and validates the answer's citations", async () => {
    const ctx = makeCtx();
    const events: ChatEvent[] = [];
    let ebitdaRef = "";
    const { client, calls } = fakeClient([
      () => ({ content: [text("Miro los indicadores."), toolUse("t1", "get_kpis", { period: "closed_fy" }), toolUse("t2", "get_debt_positions", {})], stop_reason: "tool_use" }),
      (p) => {
        const messages = p.messages as { role: string; content: unknown }[];
        const results = messages.at(-1)!.content as { tool_use_id: string; content: string }[];
        expect(results.map((r) => r.tool_use_id)).toEqual(["t1", "t2"]); // all results in one user message
        const kpis = JSON.parse(results[0].content) as { closed_fy: { kpis: { key: string; ref: string }[] } };
        ebitdaRef = kpis.closed_fy.kpis.find((k) => k.key === "ebitda")!.ref;
        return { content: [text(`El EBITDA del cierre es 1.000 € [[ref:${ebitdaRef}]] y la deuda 2.000 € [[ref:rinvented]].`)], stop_reason: "end_turn" };
      },
    ]);
    const r = await runTurn({ client, model: "claude-opus-5-5", system: [{ type: "text", text: "s" }], history: [], question: "¿EBITDA?", ctx, emit: (e) => events.push(e) });
    expect(r.outcome).toBe("answered");
    expect(r.citations.map((c) => c.h)).toEqual([ebitdaRef]);
    expect(r.text).not.toContain("rinvented");
    // The debt lost its invented citation: the sentence is flagged although the EBITDA in it is cited.
    expect(r.uncited).toEqual([expect.stringContaining("la deuda 2.000 €")]);
    expect(r.trace.map((t) => t.tool)).toEqual(["get_kpis", "get_debt_positions"]);
    expect(events.map((e) => e.t)).toEqual(["delta", "status", "delta"]);
    expect(calls[0]).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "medium" }, tool_choice: { type: "auto" }, cache_control: { type: "ephemeral" } });
    expect(calls[0]).toHaveProperty("fallbacks", "default");
  });

  it("forbids tools on the last round so the model has to answer", async () => {
    const { client, calls } = fakeClient([
      () => ({ content: [toolUse("t1", "get_checks", {})], stop_reason: "tool_use" }),
      () => ({ content: [text("No hay cifras que dar.")], stop_reason: "end_turn" }),
    ]);
    const r = await runTurn({ client, model: "claude-opus-5-5", system: [], history: [], question: "?", ctx: makeCtx(), emit: () => {}, maxRounds: 2 });
    expect(r.outcome).toBe("answered");
    expect(calls[1]).toMatchObject({ tool_choice: { type: "none" } });
  });

  it("a refusal or an empty answer ends with a notice, not a guess", async () => {
    const refused = fakeClient([() => ({ content: [], stop_reason: "refusal" })]);
    expect((await runTurn({ client: refused.client, model: "m", system: [], history: [], question: "?", ctx: makeCtx(), emit: () => {} })).outcome).toBe("refused");
    const empty = fakeClient([() => ({ content: [], stop_reason: "end_turn" })]);
    expect((await runTurn({ client: empty.client, model: "m", system: [], history: [], question: "?", ctx: makeCtx(), emit: () => {} })).outcome).toBe("failed");
  });
});
