/**
 * Wire protocol of «Preguntar al caso»: newline-delimited JSON events. Pure; shared by the route and the browser.
 *
 *   delta  — answer text as it streams (may include citation tokens, which the browser hides until `done`)
 *   status — tools are running: the streamed text so far was a preamble, the browser clears it and shows the labels
 *   done   — the validated answer: unknown citations removed, citations resolved, uncited figures listed
 *   error  — the answer failed or was declined; the text replaces whatever streamed
 */
import type { Citation } from "./refs.ts";

export type ChatEvent =
  | { t: "delta"; text: string }
  | { t: "status"; labels: string[] }
  | { t: "done"; id: number | null; text: string; citations: Citation[]; uncited: string[] }
  | { t: "error"; message: string };

export const encodeEvent = (e: ChatEvent) => `${JSON.stringify(e)}\n`;

/** Splits a growing NDJSON buffer into complete events and the unfinished rest. */
export function decodeEvents(buffer: string): { events: ChatEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events = lines.flatMap((l) => {
    if (!l.trim()) return [];
    try {
      return [JSON.parse(l) as ChatEvent];
    } catch {
      return [];
    }
  });
  return { events, rest };
}

/** The answer bubble while it streams. */
export interface AnswerState {
  id: number | null;
  text: string;
  citations: Citation[];
  uncited: string[];
  status: string[] | null;
  done: boolean;
  error: boolean;
}

export const emptyAnswer = (): AnswerState => ({ id: null, text: "", citations: [], uncited: [], status: null, done: false, error: false });

export function applyEvent(s: AnswerState, e: ChatEvent): AnswerState {
  switch (e.t) {
    case "delta":
      return { ...s, text: s.text + e.text, status: null };
    case "status":
      return { ...s, text: "", status: e.labels };
    case "done":
      return { id: e.id, text: e.text, citations: e.citations, uncited: e.uncited, status: null, done: true, error: false };
    case "error":
      return { ...s, text: e.message, citations: [], uncited: [], status: null, done: true, error: true };
  }
}
