/**
 * One question of «Preguntar al caso»: the tool-use loop against the Messages API, streamed as ChatEvents.
 *
 * The client is injected (tests use a fake). Each round streams the model's text; if the round ends in tool calls the
 * text was a preamble (the browser clears it), the tools run (all of a round's results go back in one user message)
 * and the loop continues. The last allowed round forbids tools so the model must answer. Only the final round's text
 * is the answer; it is validated against the refs the tools registered (validateAnswer).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { ANALYST_CHAT_COPY } from "../../content/analyst-chat.es.ts";
import { fallbackParams, supportsEffort } from "../llm/model.ts";
import type { ChatEvent } from "./protocol.ts";
import { validateAnswer, type Citation, type RefRegistry } from "./refs.ts";
import { runTool, TOOL_STATUS, toolDefinitions, type ToolContext, type ToolName } from "./tools.ts";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Msg = Anthropic.Beta.Messages.BetaMessage;

/** The slice of the SDK the loop uses. */
export interface StreamingClient {
  beta: {
    messages: {
      stream(
        params: Omit<Params, "stream">,
        options?: { signal?: AbortSignal },
      ): AsyncIterable<Anthropic.Beta.Messages.BetaRawMessageStreamEvent> & { finalMessage(): Promise<Msg>; abort(): void };
    };
  };
}

export interface TraceItem {
  tool: string;
  input: unknown;
  ok: boolean;
  refs: string[];
}

export interface TurnResult {
  outcome: "answered" | "refused" | "failed";
  text: string;
  citations: Citation[];
  uncited: string[];
  trace: TraceItem[];
}

export const MAX_ROUNDS = 6;

export async function runTurn(opts: {
  client: StreamingClient;
  model: string;
  system: Anthropic.Beta.Messages.BetaTextBlockParam[];
  history: Anthropic.Beta.Messages.BetaMessageParam[];
  question: string;
  ctx: ToolContext & { registry: RefRegistry };
  emit: (e: ChatEvent) => void;
  signal?: AbortSignal;
  maxRounds?: number;
}): Promise<TurnResult> {
  const { client, model, system, ctx, emit, signal } = opts;
  const maxRounds = opts.maxRounds ?? MAX_ROUNDS;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [...opts.history, { role: "user", content: opts.question }];
  const trace: TraceItem[] = [];
  const tools = toolDefinitions();

  for (let round = 0; round < maxRounds; round++) {
    const last = round === maxRounds - 1;
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 16000,
        system,
        tools,
        tool_choice: last ? { type: "none" } : { type: "auto" },
        messages,
        // Caches the conversation so far: later rounds of this question reread the tool results cheaply.
        cache_control: { type: "ephemeral" },
        ...(supportsEffort(model) ? { output_config: { effort: "medium" as const } } : {}),
        ...fallbackParams(model),
      },
      { signal },
    );
    let streamed = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        streamed += event.delta.text;
        emit({ t: "delta", text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") return { outcome: "refused", text: ANALYST_CHAT_COPY.refused, citations: [], uncited: [], trace };

    const toolUses = final.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    if (final.stop_reason === "tool_use" && toolUses.length && !last) {
      emit({ t: "status", labels: [...new Set(toolUses.map((u) => TOOL_STATUS[u.name as ToolName] ?? "Consultando el caso"))] });
      messages.push({ role: "assistant", content: final.content });
      const results = await Promise.all(
        toolUses.map(async (u) => {
          const out = await runTool(ctx, u.name, u.input).catch((e: unknown) => ({ ok: false as const, error: `Error interno: ${(e as Error)?.name ?? "desconocido"}` }));
          trace.push({ tool: u.name, input: u.input, ok: out.ok, refs: out.ok ? out.refs : [] });
          return {
            type: "tool_result" as const,
            tool_use_id: u.id,
            content: out.ok ? JSON.stringify(out.result) : out.error,
            ...(out.ok ? {} : { is_error: true }),
          };
        }),
      );
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim() || streamed.trim();
    if (!text) return { outcome: "failed", text: ANALYST_CHAT_COPY.failed, citations: [], uncited: [], trace };
    const v = validateAnswer(text, ctx.registry);
    return { outcome: "answered", text: v.text, citations: v.citations, uncited: v.uncited, trace };
  }
  return { outcome: "failed", text: ANALYST_CHAT_COPY.failed, citations: [], uncited: [], trace };
}
