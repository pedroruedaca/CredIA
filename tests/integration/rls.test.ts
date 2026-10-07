/**
 * Tenant isolation: lender B (a real signed-in user, the same RLS client the app uses) must not read, change or
 * attach anything to lender A's case, and no client may read secret columns or case files directly.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, makeLender, must } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let A: Lender;
let B: Lender;
const ids: Record<string, string> = {};
const filePath = () => `cases/${ids.case}/trial_balance/rls-test.csv`;

/** Case-scoped tables with a `case_id` column, and a valid row for each (lender_id/case_id added per insert). */
const CASE_ROWS: Record<string, Record<string, unknown>> = {
  case_requirements: { doc_kind: "cirbe", required: true },
  documents: { kind: "trial_balance", storage_path: "x", sha256: "x", original_filename: "x.csv" },
  holded_connections: { mode: "one_time", borrower_consent_at: new Date().toISOString(), status: "synced" },
  ledger_balances: { period_kind: "closed_fy", period_start: "2025-01-01", period_end: "2025-12-31", account: "57200001", pgc3: "572", debit: 1, credit: 0, source: "upload", source_ref: "x" },
  bank_transactions: { booking_date: "2026-01-02", amount: 10, source_ref: "x" },
  debt_positions: { as_of: "2026-08-31", entity: "Banco", product: "Préstamo", drawn: 1000, source_ref: "x" },
  financial_statements: { period_kind: "ytd", period_start: "2026-01-01", period_end: "2026-08-31", statement: {} },
  checks: { check_key: "x", severity: "info", message: "x" },
  memos: { storage_path: "x" },
  audit_log: { actor: "system", action: "test" },
  delegate_links: { email: "g@x.es", token_hash: "h", expires_at: new Date(Date.now() + 86_400_000).toISOString() },
  assistant_messages: { role: "user", content: "hola" },
  support_requests: { actor: "borrower", message: "ayuda" },
  check_reviews: { check_key: "x", status: "reviewed" },
  case_borme_matches: { status: "confirmed", registry_sheet: "V-123456", company_name: "EMPRESA A SL" },
  case_cost_definitions: { preset: "trading", selectors: ["line:cogs"] },
  analyst_messages: { role: "user", content: "¿EBITDA?" },
  case_conclusions: { text: "Conclusión" },
};

/** Per-row values that must be unique or refer to the acting user. */
const unique = (table: string, userId: string): Record<string, unknown> =>
  table === "check_reviews" ? { user_id: userId }
  : table === "case_borme_matches" ? { decided_by: userId }
  : table === "analyst_messages" ? { user_id: userId }
  : table === "case_conclusions" ? { created_by: userId }
  : table === "delegate_links" ? { token_hash: `h-${crypto.randomUUID()}` }
  : table === "documents" ? { storage_path: `rls/${crypto.randomUUID()}.csv`, sha256: crypto.randomUUID() }
  : {};

beforeAll(async () => {
  A = await makeLender("Fondo A");
  B = await makeLender("Fondo B");
  const kase = must(await admin.from("cases").insert({ lender_id: A.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa A", fiscal_year_end: "2025-12-31", borrower_token_hash: `hash-${crypto.randomUUID()}` }).select("id").single()) as { id: string };
  ids.case = kase.id;
  const base = { case_id: kase.id, lender_id: A.lenderId };
  for (const [table, row] of Object.entries(CASE_ROWS)) {
    const extra = unique(table, A.userId);
    ids[table] = String((must(await admin.from(table).insert({ ...base, ...row, ...extra }).select("id").single()) as { id: string | number }).id);
  }
  ids.extraction = (must(await admin.from("extractions").insert({ document_id: ids.documents, lender_id: A.lenderId, parser: "t", output: {} }).select("id").single()) as { id: string }).id;
  ids.kpi = String((must(await admin.from("kpis").insert({ statement_id: ids.financial_statements, lender_id: A.lenderId, key: "ebitda", value: 1, formula: "x", inputs: {} }).select("id").single()) as { id: number }).id);
  ids.sync = (must(await admin.from("holded_syncs").insert({ connection_id: ids.holded_connections, lender_id: A.lenderId, period_kind: "ytd", period_start: "2026-01-01", period_end: "2026-08-31" }).select("id").single()) as { id: string }).id;
  await admin.storage.createBucket("case-files", { public: false }).catch(() => {});
  must(await admin.storage.from("case-files").upload(filePath(), new TextEncoder().encode("a;b\n1;2\n"), { upsert: true }));
});

describe("lender A sees its own case (sanity)", () => {
  it("reads the case and its rows", async () => {
    expect((await A.db.from("cases").select("id").eq("id", ids.case)).data).toHaveLength(1);
    for (const table of Object.keys(CASE_ROWS)) {
      const { data, error } = await A.db.from(table).select("id").eq("case_id", ids.case);
      expect(error, table).toBeNull();
      expect(data?.length, table).toBeGreaterThan(0);
    }
  });
});

describe("lender B cannot read lender A", () => {
  it("sees neither the case nor any case-scoped row", async () => {
    expect((await B.db.from("cases").select("id").eq("id", ids.case)).data).toEqual([]);
    for (const table of Object.keys(CASE_ROWS)) {
      const { data } = await B.db.from(table).select("id").eq("case_id", ids.case);
      expect(data ?? [], table).toEqual([]);
    }
  });
  it("sees no rows reached through a parent (extractions, KPIs, Holded syncs) nor A's lender or members", async () => {
    expect((await B.db.from("extractions").select("id").eq("id", ids.extraction)).data).toEqual([]);
    expect((await B.db.from("kpis").select("id").eq("id", ids.kpi)).data).toEqual([]);
    expect((await B.db.from("holded_syncs").select("id").eq("id", ids.sync)).data).toEqual([]);
    expect((await B.db.from("lenders").select("id").eq("id", A.lenderId)).data).toEqual([]);
    expect((await B.db.from("lender_members").select("user_id").eq("lender_id", A.lenderId)).data).toEqual([]);
  });
  it("cannot download A's files", async () => {
    const { data } = await B.db.storage.from("case-files").download(filePath());
    expect(data).toBeNull();
    const { data: signed } = await B.db.storage.from("case-files").createSignedUrl(filePath(), 60);
    expect(signed).toBeNull();
  });
});

describe("lender B cannot change lender A", () => {
  it("updates and deletes affect nothing", async () => {
    await B.db.from("cases").update({ borrower_name: "HACKED", borrower_token_hash: "stolen" }).eq("id", ids.case);
    await B.db.from("checks").update({ message: "HACKED" }).eq("case_id", ids.case);
    await B.db.from("documents").delete().eq("case_id", ids.case);
    await B.db.from("check_reviews").delete().eq("case_id", ids.case);
    const kase = must(await admin.from("cases").select("borrower_name, borrower_token_hash").eq("id", ids.case).single()) as { borrower_name: string; borrower_token_hash: string };
    expect(kase.borrower_name).toBe("Empresa A");
    expect(kase.borrower_token_hash).not.toBe("stolen");
    expect((must(await admin.from("checks").select("message").eq("id", ids.checks).single()) as { message: string }).message).toBe("x");
    expect((await admin.from("documents").select("id").eq("case_id", ids.case)).data).toHaveLength(1);
    expect((await admin.from("check_reviews").select("id").eq("case_id", ids.case)).data).toHaveLength(1);
  });

  it("cannot attach rows to A's case, neither as A nor under its own lender id", async () => {
    for (const [table, row] of Object.entries(CASE_ROWS)) {
      const extra = unique(table, B.userId);
      for (const lender_id of [A.lenderId, B.lenderId]) {
        const { error } = await B.db.from(table).insert({ ...row, ...extra, case_id: ids.case, lender_id });
        expect(error, `${table} as ${lender_id === A.lenderId ? "A" : "B"}`).not.toBeNull();
      }
    }
    expect((await admin.from("documents").select("id").eq("case_id", ids.case)).data).toHaveLength(1);
  });

  it("cannot attach rows to A's documents, statements or Holded connections", async () => {
    const tries = [
      B.db.from("extractions").insert({ document_id: ids.documents, lender_id: B.lenderId, parser: "t", output: {} }),
      B.db.from("kpis").insert({ statement_id: ids.financial_statements, lender_id: B.lenderId, key: "ebitda", value: 999, formula: "x", inputs: {} }),
      B.db.from("holded_syncs").insert({ connection_id: ids.holded_connections, lender_id: B.lenderId, period_kind: "ytd", period_start: "2026-01-01", period_end: "2026-08-31" }),
    ];
    for (const r of await Promise.all(tries)) expect(r.error).not.toBeNull();
  });

  it("cannot join A's lender or create lenders", async () => {
    expect((await B.db.from("lender_members").insert({ lender_id: A.lenderId, user_id: B.userId, role: "owner" })).error).not.toBeNull();
    expect((await B.db.from("lenders").insert({ name: "Otro" })).error).not.toBeNull();
    expect((await A.db.from("lender_members").update({ role: "owner" }).eq("user_id", A.userId).select()).data ?? []).toEqual([]);
  });
});

describe("secrets and anonymous access", () => {
  it("members cannot read token hashes or the encrypted Holded key, even on their own case", async () => {
    expect((await A.db.from("cases").select("borrower_token_hash").eq("id", ids.case)).error).not.toBeNull();
    expect((await A.db.from("delegate_links").select("token_hash").eq("case_id", ids.case)).error).not.toBeNull();
    expect((await A.db.from("holded_connections").select("token_ciphertext").eq("case_id", ids.case)).error).not.toBeNull();
    expect((await A.db.from("holded_connections").select("*").eq("case_id", ids.case)).error).not.toBeNull();
  });
  it("an anonymous client sees nothing and writes nothing", async () => {
    const anon = anonClient();
    for (const table of ["cases", "documents", "checks", "audit_log", "lenders"]) {
      expect((await anon.from(table).select("id").limit(1)).data ?? [], table).toEqual([]);
    }
    expect((await anon.from("cases").insert({ lender_id: A.lenderId, borrower_cif: "B12345674" })).error).not.toBeNull();
    expect((await anon.storage.from("case-files").download(filePath())).data).toBeNull();
  });
});

describe("BORME (shared public data)", () => {
  it("members read the index and company acts but cannot write them; anonymous clients cannot read them", async () => {
    const day = "2001-01-02";
    const entry = Math.floor(Math.random() * 1e6);
    must(await admin.from("borme_index").insert({ published_on: day, seq: 46, entry_number: entry, company_norm: "EMPRESA A", registry_sheet: "V-123456" }));
    const act = { published_on: day, borme_id: "BORME-A-2001-1-46", province: "VALENCIA", entry_number: entry, company_name: "EMPRESA A SL", registry_sheet: "V-123456", act_index: 0, act_type: "constitution", act_label: "Constitución", act_text: "" };
    must(await admin.from("borme_company_acts").insert(act));
    expect((await A.db.from("borme_index").select("entry_number").eq("published_on", day).eq("entry_number", entry)).data).toHaveLength(1);
    expect((await A.db.from("borme_company_acts").select("entry_number").eq("borme_id", act.borme_id).eq("entry_number", entry)).data).toHaveLength(1);
    expect((await A.db.from("borme_index").insert({ published_on: day, seq: 46, entry_number: entry + 1, company_norm: "X" })).error).not.toBeNull();
    expect((await A.db.from("borme_company_acts").insert({ ...act, act_index: 1 })).error).not.toBeNull();
    expect((await A.db.from("borme_sheets").insert({ sheet: "V-1", status: "ready" })).error).not.toBeNull();
    expect((await A.db.from("borme_days").insert({ day: "2001-01-01", status: "ingested" })).error).not.toBeNull();
    expect((await anonClient().from("borme_index").select("entry_number").eq("published_on", day)).data ?? []).toEqual([]);
    await admin.from("borme_company_acts").delete().eq("borme_id", act.borme_id);
    await admin.from("borme_index").delete().eq("published_on", day);
  });
});
