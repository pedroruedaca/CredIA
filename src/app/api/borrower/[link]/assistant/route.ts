/**
 * POST /api/borrower/:link/assistant — documentation assistant (borrower chat), streamed as plain text.
 *
 * Grounding is rebuilt server-side on every request from the checklist only (see src/lib/assistant/prompt.ts):
 * no financial data is ever passed to the model. Rate-limited per link holder (30 questions per rolling hour).
 * If the model declines after text has streamed, the server sends REPLACE_MARKER followed by the text that
 * should replace the partial answer.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ASSISTANT_COPY } from "@/content/assistant.es";
import { borrowerRoute, jsonError } from "@/lib/borrower/access";
import { loadPortal } from "@/lib/borrower/load";
import { RATE_LIMIT, rateLimit } from "@/lib/assistant/conversation";
import { REPLACE_MARKER } from "@/lib/assistant/protocol";
import { fallbackParams, modelFor, supportsEffort } from "@/lib/llm/model";
import { assistantContext, loadHistory, recentQuestionTimes, saveMessage, stablePrompt, systemBlocks } from "@/lib/assistant/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ message: z.string().trim().min(1).max(1000) });


let client: Anthropic | null = null;

export async function POST(req: Request, ctx: { params: Promise<{ link: string }> }) {
  const r = await borrowerRoute((await ctx.params).link);
  if (r.response) return r.response;
  const { db, access } = r;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Escribe una pregunta (máximo 1.000 caracteres).", 400);
  const question = parsed.data.message;

  if (!process.env.ANTHROPIC_API_KEY) return jsonError(ASSISTANT_COPY.failed, 503);

  const now = new Date();
  const limit = rateLimit(await recentQuestionTimes(db, access, new Date(now.getTime() - RATE_LIMIT.windowMs)), now);
  if (!limit.allowed) return jsonError(ASSISTANT_COPY.rateLimited, 429);

  const portal = await loadPortal(db, access, now);
  if (!portal) return jsonError(ASSISTANT_COPY.failed, 500);

  const history = await loadHistory(db, access, 20);
  while (history[0]?.role === "assistant") history.shift(); // the API needs a user turn first
  await saveMessage(db, access, "user", question);

  const model = modelFor("assistant");
  client ??= new Anthropic();
  const system = systemBlocks(await stablePrompt(), assistantContext(portal, access));
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: question }];

  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 4000,
      system,
      messages,
      ...(supportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
      ...fallbackParams(model),
    },
    { signal: req.signal },
  );

  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      let saved = "";
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          // the browser went away; keep consuming so the answer can still be stored
        }
      };
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            send(event.delta.text);
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" || !text.trim()) {
          send(text ? REPLACE_MARKER + ASSISTANT_COPY.refused : ASSISTANT_COPY.refused);
          saved = ASSISTANT_COPY.refused;
        } else {
          saved = text;
        }
      } catch (e) {
        // Never log the question, the answer or the token: status/class only.
        if (!req.signal.aborted) console.error("[assistant] request failed:", e instanceof Anthropic.APIError ? e.status : (e as Error)?.name);
        send(text ? REPLACE_MARKER + ASSISTANT_COPY.failed : ASSISTANT_COPY.failed);
        // A failed answer is not stored; the question stays so the thread shows it.
      } finally {
        if (saved) await saveMessage(db, access, "assistant", saved).catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new NextResponse(out, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
