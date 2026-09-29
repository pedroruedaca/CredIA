/**
 * POST /api/borrower/:token/holded
 * Borrower (magic link, no Supabase session) submits a Holded API key.
 *
 * one_time (default): key is held in memory for this request only and never stored.
 * refresh: key is sealed with AES-256-GCM (AAD = connection id) for later re-syncs.
 *
 * NOTE: long histories can take a while. maxDuration covers the MVP; move to a queue
 * (Supabase Edge Function / Inngest) once real books exceed the limit.
 */
import { NextResponse } from "next/server";
import { audit, borrowerRoute } from "@/lib/borrower/access";
import { HoldedClient, HoldedError, verifyHoldedKey } from "@/lib/connectors/holded";
import { runHoldedSync, WARNING_SEVERITY } from "@/lib/connectors/holded-sync";
import { seal } from "@/lib/crypto/token";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const r = await borrowerRoute((await ctx.params).token);
  if (r.response) return r.response;
  const { db, access } = r;
  const body = (await req.json().catch(() => null)) as { apiKey?: string; consent?: boolean; mode?: "one_time" | "refresh" } | null;
  if (!body?.apiKey || body.consent !== true) {
    return NextResponse.json({ error: "Falta la clave de API o el consentimiento." }, { status: 400 });
  }
  const mode = body.mode === "refresh" ? "refresh" : "one_time";

  // 1. The case behind the magic link (company or gestoría link, validated by borrowerRoute).
  const { data: kase } = await db
    .from("cases")
    .select("id, lender_id, fiscal_year_end")
    .eq("id", access.caseId)
    .single();
  if (!kase) return NextResponse.json({ error: "Enlace no válido o caducado." }, { status: 404 });
  if (!kase.fiscal_year_end) {
    return NextResponse.json({ error: "El prestamista aún no ha indicado el cierre del ejercicio." }, { status: 409 });
  }

  // 2. Verify the key before storing anything.
  let client: HoldedClient;
  try { client = new HoldedClient(body.apiKey); }
  catch { return NextResponse.json({ error: "La clave de API parece incompleta." }, { status: 400 }); }
  const today = new Date().toISOString().slice(0, 10);
  const check = await verifyHoldedKey(client, today);
  if (!check.ok) {
    return NextResponse.json({ error: check.message, missingScopes: check.missingScopes }, { status: 400 });
  }

  // 3. Connection row (token sealed only in refresh mode).
  const { data: conn, error: connErr } = await db
    .from("holded_connections")
    .insert({ case_id: kase.id, lender_id: kase.lender_id, token_last4: client.keyLast4, mode, borrower_consent_at: new Date().toISOString(), status: "syncing" })
    .select("id")
    .single();
  if (connErr || !conn) return NextResponse.json({ error: "No se pudo registrar la conexión." }, { status: 500 });

  if (mode === "refresh") {
    const s = seal(body.apiKey.trim(), conn.id);
    await db.from("holded_connections").update({
      token_ciphertext: `\\x${s.ciphertext.toString("hex")}`,
      token_iv: `\\x${s.iv.toString("hex")}`,
      token_tag: `\\x${s.tag.toString("hex")}`,
    }).eq("id", conn.id);
  }
  await audit(db, access, "holded.connected", { mode, last4: client.keyLast4 });

  // 4. Pull, normalise, compute.
  try {
    const result = await runHoldedSync(client, { fiscalYearEnd: kase.fiscal_year_end, today });

    for (const p of result.periods) {
      const { data: sync } = await db.from("holded_syncs").insert({
        connection_id: conn.id, lender_id: kase.lender_id, period_kind: p.period.kind,
        period_start: p.period.start, period_end: p.period.end,
        entries_fetched: p.trialBalance.linesFetched,
        entries_excluded: p.trialBalance.excluded.reduce((s, e) => s + e.lines, 0),
        warnings: p.warnings,
      }).select("id").single();

      const rawPath = `raw/holded/${kase.id}/${sync!.id}.json`;
      await db.storage.from("case-files").upload(rawPath, JSON.stringify({ excluded: p.trialBalance.excluded, lines: p.trialBalance.raw }), { contentType: "application/json" });
      await db.from("holded_syncs").update({ raw_storage_path: rawPath }).eq("id", sync!.id);

      await db.from("ledger_balances").delete().eq("case_id", kase.id).eq("period_kind", p.period.kind).eq("source", "holded");
      await db.from("ledger_balances").insert(p.trialBalance.balances.map((b) => ({
        case_id: kase.id, lender_id: kase.lender_id, period_kind: p.period.kind,
        period_start: p.period.start, period_end: p.period.end,
        account: b.account, pgc3: b.pgc3, account_name: b.name ?? null,
        debit: b.debit, credit: b.credit, source: "holded", source_ref: `${b.sourceRef}#sync:${sync!.id}`,
      })));

      const { data: stmt } = await db.from("financial_statements").insert({
        case_id: kase.id, lender_id: kase.lender_id, period_kind: p.period.kind,
        period_start: p.period.start, period_end: p.period.end, statement: p.statement,
      }).select("id").single();

      await db.from("kpis").insert(p.kpis.map((k) => ({
        statement_id: stmt!.id, lender_id: kase.lender_id, key: k.key, value: k.value,
        formula: k.formula, inputs: k.inputs, note: k.note ?? null,
      })));

      if (p.warnings.length) {
        await db.from("checks").insert(p.warnings.map((w) => ({
          case_id: kase.id, lender_id: kase.lender_id, check_key: w.code,
          severity: WARNING_SEVERITY[w.code] ?? "info",
          message: `[${p.period.kind}] ${w.message}`, evidence: w.detail ?? {},
        })));
      }
    }

    await db.from("holded_connections").update({ status: "synced", last_sync_at: new Date().toISOString() }).eq("id", conn.id);
    await audit(db, access, "holded.synced", { requests: result.requestCount, periods: result.periods.map((p) => p.period) });
    if (mode === "one_time") await audit(db, access, "holded.token_discarded", {});

    return NextResponse.json({
      ok: true,
      periods: result.periods.map((p) => ({ kind: p.period.kind, start: p.period.start, end: p.period.end, lines: p.trialBalance.linesFetched })),
      hint: mode === "one_time" ? "Ya puedes eliminar la clave en Holded (Configuración → Desarrolladores)." : undefined,
    });
  } catch (e) {
    const code = e instanceof HoldedError ? e.code : "error";
    const status = code === "invalid_key" ? "invalid_key" : code === "missing_scope" ? "missing_scope" : "error";
    await db.from("holded_connections").update({ status, last_error: code }).eq("id", conn.id);
    await audit(db, access, "holded.sync_failed", { code });
    return NextResponse.json({ error: "No se pudieron importar los datos de Holded. Inténtalo de nuevo o sube el sumas y saldos." }, { status: 502 });
  }
}
