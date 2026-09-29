"use client";

/** Documentation assistant chat (design/borrower-checklist.html, right column). Streams plain-text answers. */
import { ArrowRight, MessageSquareText } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { RichText } from "@/components/RichText";
import { ASSISTANT_COPY } from "@/content/assistant.es";
import { splitStepTokens } from "@/lib/assistant/conversation";
import { OPEN_STEP_EVENT, visibleAnswer } from "@/lib/assistant/protocol";

type Msg = { role: "user" | "assistant"; content: string; tone?: "notice" };

interface Props {
  token: string;
  lenderName: string;
  opening: string;
  suggestions: string[];
  history: { role: "user" | "assistant"; content: string }[];
  steps: Record<string, number>;
}

function openStep(kind: string) {
  window.dispatchEvent(new CustomEvent(OPEN_STEP_EVENT, { detail: kind }));
}

/** Renders the small formatting subset the assistant is allowed: paragraphs, numbered/bulleted lists, **bold**, step links. */
function Answer({ text, steps }: { text: string; steps: Record<string, number> }) {
  const blocks: { kind: "p" | "ol" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const kind = /^\d+[.)]\s/.test(line) ? "ol" : /^[-•]\s/.test(line) ? "ul" : "p";
    const content = kind === "ol" ? line.replace(/^\d+[.)]\s+/, "") : kind === "ul" ? line.replace(/^[-•]\s+/, "") : line;
    const last = blocks.at(-1);
    if (last && last.kind === kind && (kind !== "p" || last.lines.length > 0)) last.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }

  const inline = (line: string, key: string) =>
    splitStepTokens(line, steps).map((seg, i) =>
      seg.type === "text" ? (
        <RichText key={`${key}-${i}`} text={seg.text} />
      ) : (
        <button
          key={`${key}-${i}`}
          type="button"
          onClick={() => openStep(seg.kind)}
          className="mt-1 block text-[13px] font-medium text-accent underline hover:text-accent-hover"
        >
          Ir al paso {seg.step}
        </button>
      ),
    );

  return (
    <div className="flex flex-col gap-2">
      {blocks
        .filter((b) => b.lines.length > 0)
        .map((b, bi) =>
          b.kind === "p" ? (
            <p key={bi}>{b.lines.flatMap((l, li) => [li > 0 ? " " : null, ...inline(l, `${bi}-${li}`)])}</p>
          ) : b.kind === "ol" ? (
            <ol key={bi} className="list-decimal pl-[18px]">
              {b.lines.map((l, li) => <li key={li}>{inline(l, `${bi}-${li}`)}</li>)}
            </ol>
          ) : (
            <ul key={bi} className="list-disc pl-[18px]">
              {b.lines.map((l, li) => <li key={li}>{inline(l, `${bi}-${li}`)}</li>)}
            </ul>
          ),
        )}
    </div>
  );
}

export function AssistantPanel({ token, lenderName, opening, suggestions, history, steps }: Props) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: opening }, ...history]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [humanState, setHumanState] = useState<"idle" | "sending" | "sent">("idle");
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const base = `/api/borrower/${encodeURIComponent(token)}`;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const setLast = (content: string, tone?: Msg["tone"]) =>
    setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content, tone }]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: q }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(`${base}/assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        setLast(json.error ?? ASSISTANT_COPY.failed, "notice");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        setLast(visibleAnswer(raw));
      }
      if (!raw.trim()) setLast(ASSISTANT_COPY.failed, "notice");
    } catch {
      setLast(ASSISTANT_COPY.failed, "notice");
    } finally {
      setBusy(false);
    }
  }

  async function askHuman() {
    if (humanState !== "idle") return;
    setHumanState("sending");
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content;
    const res = await fetch(`${base}/support`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: lastQuestion }),
    }).catch(() => null);
    if (!res?.ok) {
      setHumanState("idle");
      setMessages((prev) => [...prev, { role: "assistant", content: "No hemos podido enviar el aviso. Inténtalo de nuevo.", tone: "notice" }]);
      return;
    }
    setHumanState("sent");
    setMessages((prev) => [...prev, { role: "assistant", content: ASSISTANT_COPY.humanSent(lenderName), tone: "notice" }]);
  }

  const lastIsAssistant = messages.at(-1)?.role === "assistant";

  return (
    <section
      aria-label={ASSISTANT_COPY.title}
      className="flex h-[640px] max-h-[80vh] min-h-[420px] flex-col overflow-hidden rounded-card border border-line bg-surface lg:h-auto lg:max-h-none lg:grow"
    >
      <div className="flex items-center gap-3 border-b border-line-row bg-accent-tint px-[18px] py-4">
        <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-accent">
          <MessageSquareText size={18} className="text-white" aria-hidden />
        </div>
        <div className="grow">
          <h2 className="text-[15px] font-semibold">{ASSISTANT_COPY.title}</h2>
          <div className="text-xs text-ink-2">{ASSISTANT_COPY.subtitle}</div>
        </div>
      </div>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-busy={busy}
        className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 pb-2 pt-4 text-sm leading-normal"
      >
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-[12px_12px_4px_12px] bg-accent px-3 py-2.5 text-white">
              {m.content}
            </div>
          ) : (
            <div
              key={i}
              className={`max-w-[90%] self-start break-words rounded-[12px_12px_12px_4px] px-3 py-2.5 ${m.tone === "notice" ? "bg-warn-bg text-warn" : "bg-[#F1F0EB] text-ink"}`}
            >
              {m.content ? <Answer text={m.content} steps={steps} /> : <span className="text-muted">Escribiendo…</span>}
            </div>
          ),
        )}
        <div className="grow" />
        {!busy && lastIsAssistant && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="min-h-8 rounded-full border border-line-strong bg-surface px-3 py-1 text-xs text-ink hover:bg-surface-subtle"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex flex-col gap-2 border-t border-line-row px-3.5 pb-3.5 pt-3"
      >
        <div className="flex gap-2">
          <label htmlFor={inputId} className="sr-only">Escribe tu pregunta</label>
          <input
            id={inputId}
            type="text"
            value={input}
            maxLength={1000}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ASSISTANT_COPY.placeholder}
            autoComplete="off"
            className="h-11 min-w-0 grow rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Enviar pregunta"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <ArrowRight size={18} aria-hidden />
          </button>
        </div>
        <div className="flex items-start justify-between gap-2 text-[11px] leading-snug text-muted">
          <span>{ASSISTANT_COPY.disclaimer}</span>
          <button
            type="button"
            onClick={askHuman}
            disabled={humanState !== "idle"}
            className="-my-3 whitespace-nowrap py-3 text-[11px] text-accent underline hover:text-accent-hover disabled:text-muted disabled:no-underline"
          >
            {humanState === "sent" ? "Aviso enviado" : ASSISTANT_COPY.human}
          </button>
        </div>
      </form>
    </section>
  );
}
