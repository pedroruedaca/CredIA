"use client";

/**
 * Documentation assistant as a floating layer at the bottom of the main column (design/borrower-flow2.html).
 * At rest it is only a slim input bar so it never covers the step; focusing it reveals the tip for the current
 * step and suggestion pills. Sending a question expands the thread upward (max ~50% height); Esc or a click
 * outside collapses it back to the bar.
 * Same API route, grounding and guardrails as before; only the UI changed.
 */
import { ArrowUp, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { RichText } from "@/components/RichText";
import { cx } from "@/components/ui/cx";
import { useDismiss } from "@/components/ui/useDismiss";
import { ASSISTANT_COPY, STEP_SUGGESTIONS, STEP_TIP } from "@/content/assistant.es";
import { STEP_COPY } from "@/content/borrower-portal.es";
import { splitStepTokens } from "@/lib/assistant/conversation";
import { visibleAnswer } from "@/lib/assistant/protocol";
import type { RequirementKind } from "@/lib/cases/requirements";
import type { StepId } from "@/lib/borrower/steps";

type Msg = { role: "user" | "assistant"; content: string; tone?: "notice" };

interface Props {
  link: string;
  lenderName: string;
  current: StepId;
  opening: string;
  history: { role: "user" | "assistant"; content: string }[];
  steps: Record<string, number>;
}

/** Paragraphs, numbered/bulleted lists, **bold**; [[step:x]] tokens become pills that navigate to that step. */
function Answer({ text, steps, onStep }: { text: string; steps: Record<string, number>; onStep: (kind: string) => void }) {
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
          onClick={() => onStep(seg.kind)}
          className="mx-0.5 inline-flex min-h-8 items-center rounded-full bg-accent-tint px-3 text-[13px] font-medium text-accent hover:bg-accent-ring"
        >
          Ir a {STEP_COPY[seg.kind as RequirementKind]?.short ?? `paso ${seg.step}`}
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
            <ol key={bi} className="list-decimal pl-[18px]">{b.lines.map((l, li) => <li key={li}>{inline(l, `${bi}-${li}`)}</li>)}</ol>
          ) : (
            <ul key={bi} className="list-disc pl-[18px]">{b.lines.map((l, li) => <li key={li}>{inline(l, `${bi}-${li}`)}</li>)}</ul>
          ),
        )}
    </div>
  );
}

export function AssistantBar({ link, lenderName, current, opening, history, steps }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: opening }, ...history]);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [humanState, setHumanState] = useState<"idle" | "sending" | "sent">("idle");
  const [hints, setHints] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const threadId = useId();
  const base = `/api/borrower/${encodeURIComponent(link)}`;

  useDismiss(open || hints, () => {
    setOpen(false);
    setHints(false);
  }, rootRef, true);
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const setLast = (content: string, tone?: Msg["tone"]) => setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content, tone }]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setHints(false);
    setOpen(true);
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: q }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(`${base}/assistant`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: q }) });
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
    setOpen(true);
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content;
    const res = await fetch(`${base}/support`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: lastQuestion }) }).catch(() => null);
    if (!res?.ok) {
      setHumanState("idle");
      setMessages((prev) => [...prev, { role: "assistant", content: "No hemos podido enviar el aviso. Inténtalo de nuevo.", tone: "notice" }]);
      return;
    }
    setHumanState("sent");
    setMessages((prev) => [...prev, { role: "assistant", content: ASSISTANT_COPY.humanSent(lenderName), tone: "notice" }]);
  }

  const goToStep = (kind: string) => {
    setOpen(false);
    router.push(`?paso=${kind}`);
  };

  const suggestions = STEP_SUGGESTIONS[current] ?? [];

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-4 bottom-3 z-30 flex flex-col gap-2 sm:inset-x-10 sm:bottom-5 sm:max-w-[560px] lg:left-[356px] lg:max-w-[600px]"
    >
      {open ? (
        <section
          id={threadId}
          aria-label={ASSISTANT_COPY.title}
          className="pointer-events-auto flex max-h-[50vh] flex-col overflow-hidden rounded-panel bg-surface shadow-float animate-[rise-in_200ms_ease-out]"
        >
          <div className="flex items-center gap-2.5 px-4 pt-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-accent"><Sparkles size={12} strokeWidth={2.2} className="text-white" aria-hidden /></span>
            <h2 className="grow text-sm font-semibold">{ASSISTANT_COPY.title}</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar conversación" className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-soft">
              <X size={18} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
          <div ref={listRef} role="log" aria-live="polite" aria-busy={busy} className="flex min-h-0 grow flex-col gap-2.5 overflow-y-auto px-4 pb-3 pt-1 text-sm leading-normal">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-[18px_18px_6px_18px] bg-ink px-3.5 py-2 text-white">{m.content}</div>
              ) : (
                <div key={i} className={cx("max-w-[90%] self-start break-words rounded-[18px_18px_18px_6px] px-3.5 py-2", m.tone === "notice" ? "bg-warn-bg text-warn" : "bg-soft text-ink")}>
                  {m.content ? <Answer text={m.content} steps={steps} onStep={goToStep} /> : <span className="text-muted">Escribiendo…</span>}
                </div>
              ),
            )}
          </div>
          <p className="px-4 pb-3 text-xs text-muted">{ASSISTANT_COPY.disclaimer}</p>
        </section>
      ) : (
        hints && (
          <section aria-label={ASSISTANT_COPY.title} className="pointer-events-auto flex flex-col gap-3 rounded-[22px] bg-surface p-3 pl-4 shadow-float animate-[fade-in_150ms_ease-out]">
            <div className="flex items-start gap-2.5 text-sm leading-normal">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent"><Sparkles size={12} strokeWidth={2.2} className="text-white" aria-hidden /></span>
              <span className="grow pt-0.5">{STEP_TIP[current]}</span>
              <button type="button" onClick={() => setHints(false)} aria-label="Ocultar consejo" className="-my-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink">
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="min-h-8 rounded-full bg-soft-control px-3 py-1 text-[13px] text-ink transition-colors hover:bg-track/70">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={askHuman} disabled={humanState !== "idle"} className="min-h-9 self-start text-xs text-accent underline-offset-4 hover:underline disabled:text-muted sm:hidden">
              {humanState === "sent" ? "Aviso enviado" : "o habla con una persona"}
            </button>
          </section>
        )
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="pointer-events-auto flex h-12 items-center gap-2 rounded-full bg-surface pl-4 pr-1.5 shadow-[0_0_0_1px_var(--color-hairline),0_8px_24px_rgba(17,19,21,0.08)]"
      >
        <label htmlFor={inputId} className="sr-only">Pregunta al asistente</label>
        <input
          id={inputId}
          type="text"
          value={input}
          maxLength={1000}
          autoComplete="off"
          onFocus={() => (messages.length > 1 ? setOpen(true) : setHints(true))}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ASSISTANT_COPY.barPlaceholder}
          aria-controls={open ? threadId : undefined}
          className="h-11 min-w-0 grow bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        <span className="hidden whitespace-nowrap text-xs text-muted sm:inline">
          o{" "}
          <button type="button" onClick={askHuman} disabled={humanState !== "idle"} className="min-h-9 text-xs text-accent underline-offset-4 hover:underline disabled:text-muted disabled:no-underline">
            {humanState === "sent" ? "aviso enviado" : "habla con una persona"}
          </button>
        </span>
        <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar pregunta" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
          <ArrowUp size={16} strokeWidth={2.2} aria-hidden />
        </button>
      </form>
    </div>
  );
}
