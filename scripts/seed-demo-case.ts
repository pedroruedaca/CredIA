/**
 * Creates a complete simulated case ("Talleres Demo Levante, S.L.") for an existing lender and runs the real
 * processing pipeline on it, so the case view, KPIs, checks and exports can be seen with realistic data.
 *
 *   npm run seed:demo -- --email ana@fondo.es
 *
 * What it uploads (all synthetic):
 *   - Sumas y saldos 2025 (closed year) and 01/01–31/08/2026 (YTD), A3-style .xlsx → parsed by the real parser
 *   - Norma 43 for two accounts, Jan–Aug 2026 → parsed by the real parser
 *   - CIRBE, Modelo 200, AEAT and TGSS certificates as small PDFs marked "SIMULADO", with their extraction stored
 *     directly (no Claude API call)
 * Designed so the case shows: CIRBE debt above the books (high), bank receipts below sales (warn), an overdrawn
 * credit account, a TGSS certificate older than 90 days, and Modelo 200 / AEAT checks that pass.
 */
import { createHash, randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { r11, r22, r23, r33, r88 } from "../src/lib/__fixtures__/n43-sample.ts";
import { hashToken, MAGIC_LINK_TTL_DAYS } from "../src/lib/magic-link.ts";
import { buildStatement } from "../src/lib/pgc/mapping.ts";
import { processCase } from "../src/lib/pipeline/process-case.ts";
import type { CertificateExtraction, CirbeExtraction, Modelo200Extraction } from "../src/lib/schema/canonical.ts";
import type { LedgerBalance } from "../src/lib/types.ts";

// ------------------------------------------------------------------------------------------------ setup

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const must = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) {
    console.error(`Error (${what}): ${r.error.message}`);
    process.exit(1);
  }
  return r.data;
};

async function findLender(): Promise<{ id: string; name: string }> {
  const email = arg("email")?.trim().toLowerCase();
  if (email) {
    let userId: string | null = null;
    for (let page = 1; page < 50 && !userId; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
      if (data.users.length < 200) break;
    }
    if (!userId) {
      console.error(`No existe ningún usuario con el correo ${email}. Inicia sesión una vez en la app con ese correo.`);
      process.exit(1);
    }
    const m = must(await db.from("lender_members").select("lender_id, lenders(name)").eq("user_id", userId).limit(1).maybeSingle(), "lender_members");
    if (!m) {
      console.error(`${email} no pertenece a ninguna entidad. Ejecuta antes: npm run seed:lender -- --email ${email} --lender "<nombre>"`);
      process.exit(1);
    }
    return { id: m.lender_id, name: (m.lenders as unknown as { name: string } | null)?.name ?? "" };
  }
  const all = must(await db.from("lenders").select("id, name").limit(2), "lenders");
  if (all?.length !== 1) {
    console.error("Indica el correo del usuario prestamista: npm run seed:demo -- --email <correo>");
    process.exit(1);
  }
  return all![0];
}

// ------------------------------------------------------------------------------------------------ dates

const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
// Closed year = last complete calendar year; YTD = Jan 1 → end of last complete month (at least 3 months).
const fyYear = today.getUTCFullYear() - 1;
const ytdEndDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
const ytdMonths = Math.max(3, ytdEndDate.getUTCMonth() + 1);
const ytdEnd = iso(ytdMonths === ytdEndDate.getUTCMonth() + 1 ? ytdEndDate : new Date(Date.UTC(today.getUTCFullYear(), 3, 0)));
const ytdYear = today.getUTCFullYear();
const f = ytdMonths / 12;

// ------------------------------------------------------------------------------------------------ accounts

type Acc = [code: string, name: string, net: number]; // net = debit − credit
const EQUITY_PLUG = "11300000";

function balanced(rows: Acc[]): Acc[] {
  const sum = rows.filter((r) => r[0] !== EQUITY_PLUG).reduce((s, r) => s + r[2], 0);
  return rows.map((r) => (r[0] === EQUITY_PLUG ? [r[0], r[1], Math.round(-sum * 100) / 100] : r));
}

const closedAccounts = balanced([
  ["10000000", "Capital social", -60_000],
  [EQUITY_PLUG, "Reservas voluntarias", 0],
  ["17000001", "Préstamo BBVA largo plazo", -150_000],
  ["21300000", "Maquinaria", 320_000],
  ["21800000", "Elementos de transporte", 60_000],
  ["28130000", "Amortización acumulada maquinaria", -130_000],
  ["30000000", "Mercaderías", 85_000],
  ["40000001", "Proveedores", -120_000],
  ["41000001", "Acreedores por prestación de servicios", -15_000],
  ["43000001", "Clientes", 210_000],
  ["43000002", "Clientes · Grupo Mediterráneo", 95_000],
  ["47200000", "HP IVA soportado", 6_000],
  ["47500000", "HP acreedora por conceptos fiscales", -22_000],
  ["47600000", "Organismos de la Seguridad Social acreedores", -11_000],
  ["52000001", "Préstamo BBVA corto plazo", -50_000],
  ["55100001", "Cuenta corriente con socios", -30_000],
  ["57200001", "Banco Santander", 118_000],
  ["57200002", "BBVA cuenta de crédito", -24_000],
  ["60000000", "Compras de mercaderías", 1_050_000],
  ["62100000", "Arrendamientos", 48_000],
  ["62900000", "Otros servicios", 110_000],
  ["63000000", "Impuesto sobre beneficios", 27_000],
  ["63100000", "Otros tributos", 9_000],
  ["64000000", "Sueldos y salarios", 330_000],
  ["64200000", "Seguridad Social a cargo de la empresa", 98_000],
  ["66200000", "Intereses de deudas", 14_500],
  ["68100000", "Amortización del inmovilizado material", 42_000],
  ["70000000", "Ventas de mercaderías", -1_850_000],
  ["76900000", "Otros ingresos financieros", -1_500],
]);

const r0 = (n: number) => Math.round(n);
const ytdAccounts = balanced([
  ["10000000", "Capital social", -60_000],
  [EQUITY_PLUG, "Reservas voluntarias", 0],
  ["17000001", "Préstamo BBVA largo plazo", -125_000],
  ["21300000", "Maquinaria", 345_000],
  ["21800000", "Elementos de transporte", 60_000],
  ["28130000", "Amortización acumulada maquinaria", -158_000],
  ["30000000", "Mercaderías", 97_000],
  ["40000001", "Proveedores", -141_000],
  ["41000001", "Acreedores por prestación de servicios", -12_000],
  ["43000001", "Clientes", 262_000],
  ["43000002", "Clientes · Grupo Mediterráneo", 121_000],
  ["47200000", "HP IVA soportado", 7_500],
  ["47500000", "HP acreedora por conceptos fiscales", -19_000],
  ["47600000", "Organismos de la Seguridad Social acreedores", -11_500],
  ["52000001", "Préstamo BBVA corto plazo", -50_000],
  ["55100001", "Cuenta corriente con socios", -30_000],
  ["57200001", "Banco Santander", 96_000],
  ["57200002", "BBVA cuenta de crédito", -31_000],
  ["60000000", "Compras de mercaderías", r0(1_140_000 * f)],
  ["62100000", "Arrendamientos", r0(48_000 * f)],
  ["62900000", "Otros servicios", r0(120_000 * f)],
  ["63100000", "Otros tributos", r0(9_000 * f)],
  ["64000000", "Sueldos y salarios", r0(348_000 * f)],
  ["64200000", "Seguridad Social a cargo de la empresa", r0(103_500 * f)],
  ["66200000", "Intereses de deudas", r0(16_500 * f)],
  ["68100000", "Amortización del inmovilizado material", r0(42_000 * f)],
  ["70000000", "Ventas de mercaderías", -r0(1_980_000 * f)],
]);
const ytdRevenue = r0(1_980_000 * f);

const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
async function a3Xlsx(rows: Acc[], start: string, end: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sumas y saldos");
  ws.addRow(["A3ECO", null, null, null, null, `Fecha: ${dmy(iso(today))}`]);
  ws.addRow(["TALLERES DEMO LEVANTE SL"]);
  ws.addRow([`Sumas y Saldos · Del ${dmy(start)} al ${dmy(end)}`]);
  ws.addRow([]);
  ws.addRow(["Cuenta", "Descripción", "Saldo Anterior", "Debe", "Haber", "Saldo"]);
  for (const [code, name, net] of rows) ws.addRow([code, name, 0, net > 0 ? net : 0, net < 0 ? -net : 0, net]);
  ws.addRow([]);
  const d = rows.reduce((s, r) => s + Math.max(r[2], 0), 0);
  ws.addRow(["Totales", null, 0, d, d, 0]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ------------------------------------------------------------------------------------------------ Norma 43

const yymmdd = (s: string) => s.slice(2, 4) + s.slice(5, 7) + s.slice(8, 10);
function n43(): Uint8Array {
  type Tx = { date: string; amount: number; concept: string; text: string; ref?: string };
  const months = Array.from({ length: ytdMonths }, (_, i) => `${ytdYear}-${String(i + 1).padStart(2, "0")}`);
  const receiptsTotal = Math.round(ytdRevenue * 1.21 * 0.69); // ~31 % below sales + VAT
  const santander: Tx[] = [];
  const bbva: Tx[] = [];
  months.forEach((m, i) => {
    const r = receiptsTotal / months.length;
    santander.push({ date: `${m}-05`, amount: Math.round(r * 0.45), concept: "02", text: "TRANSFERENCIA DE GRUPO MEDITERRANEO SA", ref: `FRA ${ytdYear}-${String(i * 3 + 1).padStart(3, "0")}` });
    santander.push({ date: `${m}-12`, amount: Math.round(r * 0.35), concept: "02", text: "TRANSFERENCIA DE CLIENTE LOGISTICA SUR SL", ref: `FRA ${ytdYear}-${String(i * 3 + 2).padStart(3, "0")}` });
    santander.push({ date: `${m}-20`, amount: Math.round(r * 0.2), concept: "12", text: "LIQUIDACION TPV COMERCIO" });
    santander.push({ date: `${m}-10`, amount: -Math.round(1_140_000 * 1.21 / 12 * 0.9), concept: "04", text: "TRANSFERENCIA A PROVEEDORES VARIOS" });
    santander.push({ date: `${m}-28`, amount: -29_000, concept: "04", text: `NOMINAS ${m}` });
    santander.push({ date: `${m}-28`, amount: -8_600, concept: "04", text: "SEGURIDAD SOCIAL TGSS REC." });
    santander.push({ date: `${m}-02`, amount: -4_000, concept: "04", text: "ALQUILER NAVE POLIGONO" });
    if ((i + 1) % 3 === 1 && i > 0) santander.push({ date: `${m}-20`, amount: -24_500, concept: "03", text: "AEAT MODELO 303" });
    bbva.push({ date: `${m}-01`, amount: -5_200, concept: "04", text: "CUOTA PRESTAMO 0182-4455", ref: "AMORTIZACION + INTERESES" });
    bbva.push({ date: `${m}-15`, amount: 3_000, concept: "04", text: "TRASPASO DESDE SANTANDER" });
    santander.push({ date: `${m}-15`, amount: -3_000, concept: "04", text: "TRASPASO A BBVA" });
  });
  const start = `${ytdYear}-01-01`;
  const records: string[] = [];
  const account = (acct: string, bank: string, branch: string, opening: number, txs: Tx[]) => {
    txs.sort((a, b) => a.date.localeCompare(b.date));
    records.push(r11(bank, branch, acct, yymmdd(start), yymmdd(ytdEnd), opening, "TALLERES DEMO LEVANTE"));
    for (const t of txs) {
      records.push(r22(branch, yymmdd(t.date), yymmdd(t.date), t.concept, "000", t.amount, "", t.ref ?? ""));
      records.push(r23(1, t.text, t.ref ?? ""));
    }
    const debits = txs.filter((t) => t.amount < 0);
    const credits = txs.filter((t) => t.amount > 0);
    const closing = opening + txs.reduce((s, t) => s + t.amount, 0);
    records.push(r33(bank, branch, acct, debits.length, -debits.reduce((s, t) => s + t.amount, 0), credits.length, credits.reduce((s, t) => s + t.amount, 0), Math.round(closing * 100) / 100));
  };
  const santanderNet = santander.reduce((s, t) => s + t.amount, 0);
  account("0200051332", "0049", "1500", 96_000 - santanderNet, santander);
  account("0200099876", "0182", "4455", 1_500, bbva);
  records.push(r88(records.length));
  return new TextEncoder().encode(records.join("\r\n") + "\r\n");
}

// ------------------------------------------------------------------------------------------------ PDFs

/** Minimal one-page PDF (Helvetica, WinAnsi) with a "SIMULADO" title and text lines. */
function pdf(title: string, lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = [
    "BT /F1 9 Tf 50 800 Td (DOCUMENTO SIMULADO - credIA demo - sin validez) Tj ET",
    `BT /F1 18 Tf 50 760 Td (${esc(title)}) Tj ET`,
    ...lines.map((l, i) => `BT /F1 11 Tf 50 ${725 - i * 18} Td (${esc(l)}) Tj ET`),
  ].join("\n");
  const content = Buffer.from(text, "latin1");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content.toString("latin1")}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES", { useGrouping: "always" } as unknown as Intl.NumberFormatOptions)} EUR`;

// ------------------------------------------------------------------------------------------------ main

const CIF = "B12345674";
const COMPANY = "Talleres Demo Levante, S.L.";
const lender = await findLender();
const now = new Date();
const token = randomBytes(32).toString("base64url");

const kase = must(
  await db
    .from("cases")
    .insert({
      lender_id: lender.id,
      borrower_cif: CIF,
      borrower_name: COMPANY,
      status: "processing",
      fiscal_year_end: `${fyYear}-12-31`,
      requested_product: "poliza_circulante",
      requested_amount: 300_000,
      requested_term_months: 24,
      borrower_email: null,
      borrower_token_hash: hashToken(token),
      borrower_token_expires_at: addDays(now, MAGIC_LINK_TTL_DAYS).toISOString(),
      submitted_at: now.toISOString(),
    })
    .select("id")
    .single(),
  "case",
) as { id: string };

const reqs = ["trial_balance", "norma43", "modelo200", "cirbe", "aeat_cert", "tgss_cert"] as const;
must(await db.from("case_requirements").insert(reqs.map((k) => ({ case_id: kase.id, lender_id: lender.id, doc_kind: k, required: true, max_age_days: k === "tgss_cert" ? 90 : null }))), "requirements");
await db.from("audit_log").insert({ lender_id: lender.id, case_id: kase.id, actor: "system", action: "case.created", detail: { demo: true } });

async function upload(kind: string, ext: string, filename: string, bytes: Uint8Array, contentType: string, extra: Record<string, unknown> = {}) {
  const path = `cases/${kase.id}/${kind}/${crypto.randomUUID()}.${ext}`;
  must(await db.storage.from("case-files").upload(path, bytes, { contentType }), `storage ${filename}`);
  const doc = must(
    await db
      .from("documents")
      .insert({
        case_id: kase.id, lender_id: lender.id, kind, storage_path: path, sha256: createHash("sha256").update(bytes).digest("hex"),
        original_filename: filename, size_bytes: bytes.length, content_type: contentType, ...extra,
      })
      .select("id")
      .single(),
    `document ${filename}`,
  ) as { id: string };
  await db.from("audit_log").insert({ lender_id: lender.id, case_id: kase.id, actor: "borrower", action: "document.uploaded", detail: { kind, demo: true } });
  return doc.id;
}

async function extracted(docId: string, kind: string, canonical: unknown, summary: Record<string, unknown>) {
  must(await db.from("extractions").insert({ document_id: docId, lender_id: lender.id, parser: `demo:${kind}`, status: "parsed", output: { model: "demo", canonical }, warnings: [], summary }), `extraction ${kind}`);
}

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF = "application/pdf";

// Accounting (older upload = closed year)
await upload("trial_balance", "xlsx", `sumas-y-saldos-${fyYear}.xlsx`, await a3Xlsx(closedAccounts, `${fyYear}-01-01`, `${fyYear}-12-31`), XLSX);
await new Promise((r) => setTimeout(r, 1100));
await upload("trial_balance", "xlsx", `sumas-y-saldos-${ytdYear}-ytd.xlsx`, await a3Xlsx(ytdAccounts, `${ytdYear}-01-01`, ytdEnd), XLSX);
await upload("norma43", "n43", `movimientos-${ytdYear}.n43`, n43(), "text/plain", { bank: "Santander" });

// Modelo 200 consistent with the closed-year books (so the checks pass)
const toBalances = (rows: Acc[]): LedgerBalance[] =>
  rows.map(([account, name, net], i) => ({ account, pgc3: account.slice(0, 3), name, debit: Math.max(net, 0), credit: Math.max(-net, 0), source: "upload", sourceRef: `demo:row:${i}` }));
const closedStmt = buildStatement(toBalances(closedAccounts), { kind: "closed_fy", start: `${fyYear}-01-01`, end: `${fyYear}-12-31` }).data;
const m200: Modelo200Extraction = {
  nif: CIF,
  fiscalYear: fyYear,
  fields: {
    revenue: closedStmt.incomeStatement.revenue,
    operatingResult: closedStmt.incomeStatement.operatingResult,
    preTaxResult: closedStmt.incomeStatement.preTaxResult,
    netIncome: closedStmt.incomeStatement.netIncome,
    equity: closedStmt.balanceSheet.equityAndLiabilities.equity,
    totalAssets: closedStmt.balanceSheet.assets.total,
  },
  sourcePages: { revenue: 3, operatingResult: 3, preTaxResult: 3, netIncome: 3, equity: 2, totalAssets: 2 },
};
const m200Id = await upload("modelo200", "pdf", `modelo-200-${fyYear}.pdf`, pdf(`Modelo 200 - Ejercicio ${fyYear}`, [
  `NIF ${CIF} - ${COMPANY}`,
  `Importe neto de la cifra de negocios: ${eur(m200.fields.revenue!)}`,
  `Resultado de explotacion: ${eur(m200.fields.operatingResult!)}`,
  `Resultado del ejercicio: ${eur(m200.fields.netIncome!)}`,
  `Patrimonio neto: ${eur(m200.fields.equity!)}`,
]), PDF, { status: "parsed" });
await extracted(m200Id, "modelo200", { kind: "accounts", data: m200, periodEnd: `${fyYear}-12-31` }, { fiscalYear: fyYear });

// CIRBE at the YTD date: more drawn debt than the books show (ICO loan and leasing not booked)
const cirbe: CirbeExtraction = {
  nif: CIF,
  asOf: ytdEnd,
  positions: [
    { entity: "BBVA", product: "Préstamo", drawn: 175_000, limit: null, overdue: 0, maturity: "Más de 1 año", page: 2 },
    { entity: "BBVA", product: "Crédito (póliza)", drawn: 31_000, limit: 60_000, overdue: 0, maturity: "Menos de 1 año", page: 2 },
    { entity: "Banco Sabadell", product: "Préstamo ICO", drawn: 65_000, limit: null, overdue: 0, maturity: "Más de 1 año", page: 2 },
    { entity: "CaixaBank", product: "Arrendamiento financiero", drawn: 24_000, limit: null, overdue: 0, maturity: "Más de 1 año", page: 3 },
    { entity: "CaixaBank", product: "Aval técnico", drawn: 15_000, limit: 15_000, overdue: 0, maturity: null, page: 3 },
  ],
};
const cirbeId = await upload("cirbe", "pdf", `cirbe-${ytdEnd}.pdf`, pdf(`Informe CIRBE - ${dmy(ytdEnd)}`, [
  `Titular: ${COMPANY} (${CIF})`,
  ...cirbe.positions.map((p) => `${p.entity} - ${p.product}: dispuesto ${eur(p.drawn)}${p.limit ? `, limite ${eur(p.limit)}` : ""}`),
]), PDF, { status: "parsed", issued_on: ytdEnd });
await extracted(cirbeId, "cirbe", { kind: "cirbe", data: cirbe }, { asOf: ytdEnd });

// Certificates: AEAT recent; TGSS issued 106 days ago (the case asks for ≤ 90)
const aeatIssued = iso(addDays(today, -12));
const tgssIssued = iso(addDays(today, -106));
const aeat: CertificateExtraction = { nif: CIF, issuer: "aeat", issuedOn: aeatIssued, validUntil: iso(addDays(today, 170)), result: "al_corriente", verificationCode: "DEMO7K2P9QX4LM3A", page: 1 };
const tgss: CertificateExtraction = { nif: CIF, issuer: "tgss", issuedOn: tgssIssued, validUntil: null, result: "al_corriente", verificationCode: "DEMO-TGSS-55821", page: 1 };
const aeatId = await upload("aeat_cert", "pdf", `certificado-aeat-${aeatIssued}.pdf`, pdf("Certificado de estar al corriente - AEAT", [`${COMPANY} (${CIF})`, `Emitido el ${dmy(aeatIssued)}`, "Resultado: POSITIVO (al corriente)"]), PDF, { status: "parsed", issued_on: aeatIssued });
await extracted(aeatId, "aeat_cert", { kind: "certificate", data: aeat }, { issuedOn: aeatIssued });
const tgssId = await upload("tgss_cert", "pdf", `certificado-tgss-${tgssIssued}.pdf`, pdf("Certificado de estar al corriente - TGSS", [`${COMPANY} (${CIF})`, `Emitido el ${dmy(tgssIssued)}`, "Resultado: al corriente de pago"]), PDF, { status: "parsed", issued_on: tgssIssued });
await extracted(tgssId, "tgss_cert", { kind: "certificate", data: tgss }, { issuedOn: tgssIssued });

await db.from("audit_log").insert({ lender_id: lender.id, case_id: kase.id, actor: "borrower", action: "case.submitted", detail: { demo: true } });

// Real pipeline: parses the two trial balances and the Norma 43, then builds statements, KPIs and checks.
const result = await processCase(db, kase.id);
const { data: final } = await db.from("cases").select("status").eq("id", kase.id).single();
const { count: checks } = await db.from("checks").select("id", { count: "exact", head: true }).eq("case_id", kase.id);
const { count: stmts } = await db.from("financial_statements").select("id", { count: "exact", head: true }).eq("case_id", kase.id);

console.log(`Caso de demostración creado para «${lender.name}»: ${COMPANY}`);
console.log(`  Estado: ${final?.status} · periodos: ${stmts} · verificaciones: ${checks} · pipeline: ${JSON.stringify(result)}`);
console.log(`  Ábrelo en la app: /casos/${kase.id}`);
console.log("  (El enlace de la empresa no se muestra; usa «Nuevo enlace» o «Ver como la empresa» si quieres verla.)");
