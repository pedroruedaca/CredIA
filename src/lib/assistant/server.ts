/** Assistant persistence and grounding assembly. Server-only (service role, token already checked). */
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BANKS, N43_FALLBACK } from "../../content/banks.es.ts";
import type { AdminClient, BorrowerAccess } from "../borrower/access.ts";
import type { PortalData } from "../borrower/load.ts";
import { openingMessage, suggestions } from "./conversation.ts";
import { caseInstructions, stableInstructions, toAssistantContext, type AssistantContext } from "./prompt.ts";

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

let stable: Promise<string> | null = null;

/** Rules + docs guide + bank steps. Read once per server instance (the .md ships via outputFileTracingIncludes). */
export function stablePrompt(): Promise<string> {
  stable ??= readFile(path.join(process.cwd(), "src/content/docs-guide.es.md"), "utf8").then((guide) =>
    stableInstructions(guide, BANKS, N43_FALLBACK),
  );
  return stable;
}

export function assistantContext(portal: PortalData, access: BorrowerAccess): AssistantContext {
  return toAssistantContext({
    lenderName: portal.kase.lenderName,
    companyName: portal.kase.companyName,
    actor: access.actor,
    submittedAt: portal.kase.submittedAt,
    items: portal.checklist.items,
  });
}

export function systemBlocks(stableText: string, ctx: AssistantContext) {
  return [
    { type: "text" as const, text: stableText, cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: caseInstructions(ctx) },
  ];
}

export async function loadHistory(db: AdminClient, access: BorrowerAccess, limit = 40): Promise<StoredMessage[]> {
  let q = db.from("assistant_messages").select("role, content, created_at").eq("case_id", access.caseId);
  // Each link holder (the company, or one gestoría link) has its own thread.
  q = access.delegateId ? q.eq("delegate_link_id", access.delegateId) : q.is("delegate_link_id", null);
  const { data } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return ((data ?? []) as StoredMessage[]).reverse().map(({ role, content }) => ({ role, content }));
}

export async function recentQuestionTimes(db: AdminClient, access: BorrowerAccess, since: Date): Promise<string[]> {
  let q = db.from("assistant_messages").select("created_at").eq("case_id", access.caseId);
  q = access.delegateId ? q.eq("delegate_link_id", access.delegateId) : q.is("delegate_link_id", null);
  const { data } = await q
    .eq("role", "user")
    .gt("created_at", since.toISOString());
  return (data ?? []).map((r) => r.created_at as string);
}

export async function saveMessage(db: AdminClient, access: BorrowerAccess, role: "user" | "assistant", content: string) {
  await db.from("assistant_messages").insert({
    case_id: access.caseId,
    lender_id: access.lenderId,
    delegate_link_id: access.delegateId,
    role,
    content: content.slice(0, 8000),
  });
}

/** What the chat panel needs on first render. */
export async function loadAssistantView(db: AdminClient, access: BorrowerAccess, portal: PortalData) {
  const ctx = assistantContext(portal, access);
  return {
    opening: openingMessage(ctx),
    suggestions: suggestions(ctx),
    history: await loadHistory(db, access),
    steps: Object.fromEntries(ctx.items.map((i) => [i.kind, i.step])) as Record<string, number>,
  };
}
