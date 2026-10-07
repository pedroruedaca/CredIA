/**
 * Persistence for «Preguntar al caso». Server-only; always the lender's RLS client, so a thread is only ever the
 * signed-in analyst's own (analyst_messages policies: same lender and user_id = auth.uid()).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCitations, type Citation } from "./refs.ts";
import type { TraceItem } from "./run.ts";
import type { BankRow } from "./tools.ts";

export interface ThreadMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: string;
}

export async function loadThread(db: SupabaseClient, caseId: string, userId: string, limit = 60): Promise<ThreadMessage[]> {
  const { data, error } = await db
    .from("analyst_messages")
    .select("id, role, content, citations, created_at")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  // Before migration 0022 the table does not exist: an empty thread.
  if (error) return [];
  return (data ?? [])
    .reverse()
    .map((m) => ({ id: Number(m.id), role: m.role as ThreadMessage["role"], content: m.content as string, citations: parseCitations(m.citations), createdAt: m.created_at as string }));
}

export async function saveMessage(
  db: SupabaseClient,
  row: { caseId: string; lenderId: string; userId: string; role: "user" | "assistant"; content: string; citations?: Citation[]; trace?: TraceItem[] },
): Promise<number | null> {
  const { data, error } = await db
    .from("analyst_messages")
    .insert({
      case_id: row.caseId,
      lender_id: row.lenderId,
      user_id: row.userId,
      role: row.role,
      content: row.content.slice(0, 16000),
      citations: row.citations ?? [],
      // Tool names, inputs and the handles they returned; never rows or document text.
      tool_trace: (row.trace ?? []).slice(0, 40).map((t) => ({ tool: t.tool, input: t.input, ok: t.ok, refs: t.refs.slice(0, 200) })),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[analyst-chat] message not saved:", error.code ?? "unknown");
    return null;
  }
  return Number(data.id);
}

export async function recentQuestionTimes(db: SupabaseClient, userId: string, since: Date): Promise<string[]> {
  const { data } = await db.from("analyst_messages").select("created_at").eq("user_id", userId).eq("role", "user").gt("created_at", since.toISOString()).limit(500);
  return (data ?? []).map((r) => r.created_at as string);
}

export async function clearThread(db: SupabaseClient, caseId: string, userId: string): Promise<boolean> {
  const { error } = await db.from("analyst_messages").delete().eq("case_id", caseId).eq("user_id", userId);
  return !error;
}

/** The case's bank movements (own accounts, classified), oldest first. Paged: PostgREST caps a response at 1.000 rows. */
export async function loadBankRows(db: SupabaseClient, caseId: string, max = 30_000): Promise<BankRow[]> {
  const out: BankRow[] = [];
  const page = 1000;
  for (let from = 0; from < max; from += page) {
    const { data, error } = await db
      .from("bank_transactions")
      .select("booking_date, amount, description, category, iban_masked, source_ref")
      .eq("case_id", caseId)
      .order("booking_date")
      .order("id")
      .range(from, from + page - 1);
    if (error || !data) break;
    out.push(...data.map((r) => ({ ...r, amount: Number(r.amount) }) as BankRow));
    if (data.length < page) break;
  }
  return out;
}
