/**
 * Wire protocol of the streamed assistant answer (plain text). If this marker appears, everything before it is
 * discarded and the text after it replaces the answer (used when the model declines or fails mid-answer).
 */
export const REPLACE_MARKER = "\u001eREPLACE\u001e";

/** Applies the protocol to the text received so far. */
export function visibleAnswer(raw: string): string {
  const i = raw.lastIndexOf(REPLACE_MARKER);
  return i >= 0 ? raw.slice(i + REPLACE_MARKER.length) : raw;
}

