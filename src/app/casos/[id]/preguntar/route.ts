/**
 * «Preguntar al caso» — the analyst's chat about one case.
 *
 * POST { message } → newline-delimited JSON events (src/lib/analyst-chat/protocol.ts). Lender session + RLS: the case
 * is read with the analyst's own client, so the tools only ever see what the analyst can see. Every figure in the
 * answer comes from a tool, with its citation; the answer is validated before it is stored (src/lib/analyst-chat/).
 * The question and the answer are never logged; the audit log records that a question was asked and which tools ran.
 *
 * DELETE → clears the analyst's own thread for this case.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ANALYST_CHAT_COPY } from "@/content/analyst-chat.es";
import { rateLimit } from "@/lib/assistant/conversation";
import { ANALYST_RATE_LIMIT, HISTORY_MESSAGES } from "@/lib/analyst-chat/conversation";
import { caseSnapshot, stableInstructions } from "@/lib/analyst-chat/prompt";
import { encodeEvent, type ChatEvent } from "@/lib/analyst-chat/protocol";
import { RefRegistry } from "@/lib/analyst-chat/refs";
import { runTurn, type StreamingClient, type TurnResult } from "@/lib/analyst-chat/run";
import { clearThread, loadBankRows, loadThread, recentQuestionTimes, saveMessage } from "@/lib/analyst-chat/server";
import type { BankRow } from "@/lib/analyst-chat/tools";
import { loadCaseView } from "@/lib/case-view/load";
import { buildPackage } from "@/lib/case-view/package";
import { todayMadrid } from "@/lib/format";
import { getLenderContext } from "@/lib/lender";
import { modelFor } from "@/lib/llm/model";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({ message: z.string().trim().min(1).max(2000) });
const json = (error: string, status: number) => NextResponse.json({ error }, { status });

let client: Anthropic | null = null;
const STABLE = stableInstructions();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json("No encontrado", 404);
  const lender = await getLenderContext();
  if (!lender) return json("Inicia sesión de nuevo.", 401);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json("Escribe una pregunta (máximo 2.000 caracteres).", 400);
  const question = parsed.data.message;
  if (!process.env.ANTHROPIC_API_KEY) return json(ANALYST_CHAT_COPY.notConfigured, 503);

  const db = await createClient();
  const now = new Date();
  const limit = rateLimit(await recentQuestionTimes(db, lender.userId, new Date(now.getTime() - ANALYST_RATE_LIMIT.windowMs)), now, ANALYST_RATE_LIMIT);
  if (!limit.allowed) return json(ANALYST_CHAT_COPY.rateLimited, 429);

  const data = await loadCaseView(db, id);
  if (!data) return json("No encontrado", 404);
  const pkg = buildPackage(data);

  // Earlier answers may be cited again in a follow-up, unless the case was reprocessed since (figures may differ).
  const registry = new RefRegistry();
  const thread = await loadThread(db, id, lender.userId, HISTORY_MESSAGES);
  for (const m of thread) if (m.role === "assistant" && (!data.kase.processedAt || m.createdAt >= data.kase.processedAt)) m.citations.forEach((c) => registry.addCitation(c));
  const history: Anthropic.Beta.Messages.BetaMessageParam[] = thread.map((m) => ({ role: m.role, content: m.content }));
  while (history[0]?.role === "assistant") history.shift(); // the API needs a user turn first

  const saved = await saveMessage(db, { caseId: id, lenderId: lender.lenderId, userId: lender.userId, role: "user", content: question });
  if (saved === null) return json(ANALYST_CHAT_COPY.failed, 500);

  let bank: Promise<BankRow[]> | null = null;
  const system = [
    { type: "text" as const, text: STABLE, cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: caseSnapshot(data, pkg, registry, todayMadrid()) },
  ];
  client ??= new Anthropic();
  const model = modelFor("analyst");

  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeEvent(e)));
        } catch {
          // the browser went away; req.signal stops the model call and nothing more is sent
        }
      };
      let result: TurnResult;
      try {
        result = await runTurn({
          client: client as unknown as StreamingClient,
          model,
          system,
          history,
          question,
          ctx: { data, pkg, registry, bankRows: () => (bank ??= loadBankRows(db, id)) },
          emit: send,
          signal: req.signal,
        });
      } catch (e) {
        // Never log the question or the answer: status/class only.
        if (!req.signal.aborted) console.error("[analyst-chat] request failed:", e instanceof Anthropic.APIError ? e.status : (e as Error)?.name);
        result = { outcome: "failed", text: ANALYST_CHAT_COPY.failed, citations: [], uncited: [], trace: [] };
      }
      if (result.outcome === "answered") {
        const msgId = await saveMessage(db, { caseId: id, lenderId: lender.lenderId, userId: lender.userId, role: "assistant", content: result.text, citations: result.citations, trace: result.trace });
        send({ t: "done", id: msgId, text: result.text, citations: result.citations, uncited: result.uncited });
      } else {
        if (result.outcome === "refused") await saveMessage(db, { caseId: id, lenderId: lender.lenderId, userId: lender.userId, role: "assistant", content: result.text, trace: result.trace });
        send({ t: "error", message: result.text });
      }
      await db
        .from("audit_log")
        .insert({ lender_id: lender.lenderId, case_id: id, actor: lender.userId, action: "case.question_asked", detail: { outcome: result.outcome, tools: result.trace.map((t) => t.tool), citations: result.citations.length, uncited: result.uncited.length } })
        .then(() => undefined, () => undefined);
      try {
        controller.close();
      } catch {
        // already closed by the client
      }
    },
  });

  return new NextResponse(out, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json("No encontrado", 404);
  const lender = await getLenderContext();
  if (!lender) return json("Inicia sesión de nuevo.", 401);
  const db = await createClient();
  return (await clearThread(db, id, lender.userId)) ? new NextResponse(null, { status: 204 }) : json("No se ha podido borrar.", 500);
}
