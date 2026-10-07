"use client";

/**
 * An answer or conclusion with its citations: paragraphs, "- " / "1. " lists and **bold**; each citation is a small
 * numbered mono chip that names its source on hover/focus and opens it (a check's evidence, a document page, the
 * BORME PDF). Below, the numbered sources. Used by «Preguntar al caso» and the conclusions section.
 */
import Link from "next/link";
import { RichText } from "@/components/RichText";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/components/ui/cx";
import { splitCitations, type Citation, type CitedSegment } from "@/lib/analyst-chat/refs";

function Chip({ n, citation }: { n: number; citation: Citation }) {
  const cls = "ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-tint px-1 align-[1px] font-mono text-[11px] font-medium text-accent hover:bg-accent-ring hover:no-underline";
  const label = `Fuente ${n}: ${citation.label}`;
  const body = citation.href ? (
    /^https?:\/\//.test(citation.href) ? (
      <a href={citation.href} target="_blank" rel="noopener noreferrer" aria-label={label} className={cls}>{n}</a>
    ) : (
      <Link href={citation.href} scroll={false} aria-label={label} className={cls}>{n}</Link>
    )
  ) : (
    <span tabIndex={0} aria-label={label} className={cls}>{n}</span>
  );
  return <Tooltip label={citation.label} hint={citation.sourceRef ?? undefined}>{body}</Tooltip>;
}

type Block = { kind: "p" | "ol" | "ul"; lines: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      out.push({ kind: "p", lines: [] });
      continue;
    }
    const kind = /^\d+[.)]\s/.test(line) ? "ol" : /^[-•*]\s/.test(line) ? "ul" : "p";
    const content = kind === "ol" ? line.replace(/^\d+[.)]\s+/, "") : kind === "ul" ? line.replace(/^[-•*]\s+/, "") : line;
    const last = out.at(-1);
    if (last && last.kind === kind && (kind !== "p" || last.lines.length > 0)) last.lines.push(content);
    else out.push({ kind, lines: [content] });
  }
  return out.filter((b) => b.lines.length > 0);
}

/** Numbers citations across the whole text (not per line), then renders each line with its chips. */
export function CitedText({ text, citations, showSources = true, className }: { text: string; citations: readonly Citation[]; showSources?: boolean; className?: string }) {
  // Number once over the whole text so a citation keeps its number in every paragraph.
  const all = splitCitations(text, citations);
  const numberOf = new Map<string, number>();
  for (const s of all) if (s.type === "cite") numberOf.set(s.citation.h, s.n);
  const inline = (line: string, key: string) =>
    splitCitations(line, citations).map((seg: CitedSegment, i) =>
      seg.type === "text" ? <RichText key={`${key}-${i}`} text={seg.text} /> : <Chip key={`${key}-${i}`} n={numberOf.get(seg.citation.h) ?? seg.n} citation={seg.citation} />,
    );
  const sources = [...numberOf.entries()].map(([h, n]) => ({ n, c: citations.find((c) => c.h === h)! }));
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {blocks(text).map((b, bi) =>
        b.kind === "p" ? (
          <p key={bi}>{b.lines.flatMap((l, li) => [li > 0 ? " " : null, ...inline(l, `${bi}-${li}`)])}</p>
        ) : b.kind === "ol" ? (
          <ol key={bi} className="list-decimal pl-[18px]">{b.lines.map((l, li) => <li key={li}>{inline(l, `${bi}-${li}`)}</li>)}</ol>
        ) : (
          <ul key={bi} className="list-disc pl-[18px]">{b.lines.map((l, li) => <li key={li}>{inline(l, `${bi}-${li}`)}</li>)}</ul>
        ),
      )}
      {showSources && sources.length > 0 && (
        <ol aria-label="Fuentes" className="flex flex-col gap-0.5 text-xs text-muted">
          {sources.map(({ n, c }) => (
            <li key={c.h} className="flex gap-1.5">
              <span className="font-mono text-accent">{n}</span>
              {c.href ? (
                /^https?:\/\//.test(c.href) ? <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-ink">{c.label}</a> : <Link href={c.href} scroll={false} className="text-muted hover:text-ink">{c.label}</Link>
              ) : (
                <span>{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
