"use client";

/**
 * «Preguntar al caso»: the analyst's chat about this case, as the assistant bar at the bottom of the case view
 * (design language: floating layer, accent for the assistant). At rest only the input bar shows; focusing it shows
 * suggestions; asking opens the thread above the bar. Answers stream, then arrive validated: each figure with a
 * numbered citation chip. An answer can be kept as a conclusion of the case (editable first), which goes to the
 * case view and every export. The thread is private to the analyst.
 */
import { ArrowUp, BookmarkPlus, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { saveConclusion } from "@/app/casos/conclusion-actions";
import { CitedText } from "@/components/case/CitedText";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/cx";
import { useDismiss } from "@/components/ui/useDismiss";
import { ANALYST_CHAT_COPY as COPY } from "@/content/analyst-chat.es";
import { fromEditable, toEditable } from "@/lib/analyst-chat/conclusions";
import { applyEvent, decodeEvents, emptyAnswer, type AnswerState } from "@/lib/analyst-chat/protocol";
import type { Citation } from "@/lib/analyst-chat/refs";

export interface ChatMessage {
  id: number | null;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
}

type Msg = ChatMessage & { key: string; answer?: AnswerState; tone?: "notice" };

let seq = 0;
const key = () => `m${++seq}`;

function SaveConclusion({ caseId, msg, onSaved }: { caseId: string; msg: Msg; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const original = toEditable(msg.content, msg.citations);
  const [text, setText] = useState(original);
  const [state, setState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({ busy: false, error: null, saved: false });
  const fieldId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing) actionsRef.current?.scrollIntoView({ block: "nearest" });
  }, [editing]);
  if (msg.id === null) return null;
  if (state.saved) return <p role="status" className="text-xs text-ok">{COPY.saved}</p>;
  const save = async () => {
    setState({ busy: true, error: null, saved: false });
    const r = await saveConclusion(caseId, msg.id!, text === original ? undefined : fromEditable(text, msg.content, msg.citations)).catch(() => ({ ok: false as const, message: COPY.saveFailed }));
    if (r.ok) {
      setState({ busy: false, error: null, saved: true });
      onSaved();
    } else setState({ busy: false, error: r.message, saved: false });
  };
  if (!editing) {
    return (
      <Tooltip label={COPY.saveConclusion} hint={COPY.saveConclusionHint}>
        <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-9 items-center gap-1.5 self-start text-xs font-medium text-accent hover:underline">
          <BookmarkPlus size={14} strokeWidth={1.8} aria-hidden /> {COPY.saveConclusion}
        </button>
      </Tooltip>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-xs text-muted">{COPY.editBeforeSaving}</label>
      <Textarea id={fieldId} autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(10, Math.max(3, text.split("\n").length + 1))} maxLength={4000} aria-invalid={state.error ? true : undefined} />
      {state.error && <p className="flex items-center gap-2 text-xs text-high"><Pill tone="high">Error</Pill>{state.error}</p>}
      <div ref={actionsRef} className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={state.busy || !text.trim()}>{COPY.saveConclusion}</Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={state.busy}>Cancelar</Button>
      </div>
    </div>
  );
}

export function AnalystChat({
  caseId,
  history,
  suggestions,
  canSave,
}: {
  caseId: string;
  history: ChatMessage[];
  suggestions: string[];
  /** Owners and analysts may keep answers as conclusions; viewers may only ask. */
  canSave: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(() => history.map((m) => ({ ...m, key: key() })));
  const [open, setOpen] = useState(false);
  const [hints, setHints] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const threadId = useId();
  const base = `/casos/${caseId}/preguntar`;

  const close = useCallback(() => {
    setOpen(false);
    setHints(false);
  }, []);
  useDismiss(open || hints, close, rootRef, true);
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const updateLast = (f: (m: Msg) => Msg) => setMessages((prev) => [...prev.slice(0, -1), f(prev.at(-1)!)]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setHints(false);
    setOpen(true);
    setBusy(true);
    setMessages((prev) => [...prev, { key: key(), id: null, role: "user", content: q, citations: [] }, { key: key(), id: null, role: "assistant", content: "", citations: [], answer: emptyAnswer() }]);
    const fail = (message: string) => updateLast((m) => ({ ...m, content: message, tone: "notice", answer: { ...emptyAnswer(), text: message, done: true, error: true } }));
    try {
      const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: q }) });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        fail(json.error ?? COPY.failed);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let state = emptyAnswer();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = decodeEvents(buffer);
        buffer = rest;
        for (const e of events) state = applyEvent(state, e);
        const s = state;
        updateLast((m) => ({ ...m, id: s.id, content: s.text, citations: s.citations, answer: s, tone: s.error ? "notice" : undefined }));
      }
      if (!state.done) fail(COPY.failed);
    } catch {
      fail(COPY.failed);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (busy) return;
    const res = await fetch(base, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setMessages([]);
  }

  const hasThread = messages.length > 0;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-4 bottom-3 z-30 flex flex-col gap-2 sm:bottom-5 sm:left-[128px] sm:right-auto sm:w-[min(768px,calc(100vw-160px))]"
    >
      {open ? (
        <section id={threadId} aria-label={COPY.title} className="pointer-events-auto flex max-h-[65vh] flex-col overflow-hidden rounded-panel bg-surface shadow-float animate-[rise-in_200ms_ease-out]">
          <div className="flex items-center gap-2.5 px-4 pt-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-accent"><Sparkles size={12} strokeWidth={2.2} className="text-white" aria-hidden /></span>
            <h2 className="grow text-sm font-semibold">{COPY.title}</h2>
            {hasThread && (
              <Tooltip label={COPY.clear}>
                <button type="button" onClick={clear} disabled={busy} aria-label={COPY.clear} className="flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-soft disabled:opacity-50">
                  <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                </button>
              </Tooltip>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar conversación" className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-soft">
              <X size={18} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
          <div ref={listRef} role="log" aria-live="polite" aria-busy={busy} className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 pb-3 pt-1 text-sm leading-normal">
            {!hasThread && <p className="max-w-[90%] self-start rounded-[18px_18px_18px_6px] bg-soft px-3.5 py-2">{COPY.opening}</p>}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.key} className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-[18px_18px_6px_18px] bg-ink px-3.5 py-2 text-white">{m.content}</div>
              ) : (
                <div key={m.key} className="flex max-w-[92%] flex-col gap-1.5 self-start">
                  <div className={cx("break-words rounded-[18px_18px_18px_6px] px-3.5 py-2", m.tone === "notice" ? "bg-warn-bg text-warn" : "bg-soft text-ink")}>
                    {m.answer && !m.answer.done ? (
                      m.answer.status ? (
                        <span className="text-muted">{m.answer.status.join(" · ")}…</span>
                      ) : m.content ? (
                        // While streaming, citations are not resolved yet: their tokens are hidden.
                        <CitedText text={m.content} citations={[]} showSources={false} />
                      ) : (
                        <span className="text-muted">{COPY.thinking}</span>
                      )
                    ) : (
                      <CitedText text={m.content} citations={m.citations} />
                    )}
                  </div>
                  {m.answer?.done && m.answer.uncited.length > 0 && (
                    <p className="flex items-center gap-2 text-xs text-warn"><Pill tone="warn">Sin origen</Pill>{COPY.uncited(m.answer.uncited.length)}</p>
                  )}
                  {canSave && m.tone !== "notice" && m.id !== null && m.citations.length > 0 && (!m.answer || m.answer.done) && <SaveConclusion caseId={caseId} msg={m} onSaved={() => router.refresh()} />}
                </div>
              ),
            )}
          </div>
          <p className="px-4 pb-3 text-xs text-muted">{COPY.private} {COPY.disclaimer}</p>
        </section>
      ) : (
        hints &&
        suggestions.length > 0 && (
          <section aria-label={COPY.title} className="pointer-events-auto flex flex-wrap gap-1.5 rounded-[22px] bg-surface p-3 shadow-float animate-[fade-in_150ms_ease-out]">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="min-h-8 rounded-full bg-soft-control px-3 py-1 text-left text-[13px] text-ink transition-colors hover:bg-track/70">
                {s}
              </button>
            ))}
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
        <Sparkles size={15} strokeWidth={2} className="shrink-0 text-accent" aria-hidden />
        <label htmlFor={inputId} className="sr-only">{COPY.title}</label>
        <input
          id={inputId}
          type="text"
          value={input}
          maxLength={2000}
          autoComplete="off"
          onFocus={() => (hasThread ? setOpen(true) : setHints(true))}
          onChange={(e) => setInput(e.target.value)}
          placeholder={COPY.barPlaceholder}
          aria-controls={open ? threadId : undefined}
          className="h-11 min-w-0 grow bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar pregunta" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
          <ArrowUp size={16} strokeWidth={2.2} aria-hidden />
        </button>
      </form>
    </div>
  );
}
