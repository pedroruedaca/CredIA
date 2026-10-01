/**
 * Creates a lender with an owner user in the local Supabase and signs them in, saving the auth cookie the app
 * reads (@supabase/ssr format) so tests start logged in. Also writes the test fixtures to e2e/.files/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { a3Rows } from "../src/lib/__fixtures__/tb-exports";
import { n43Sample } from "../src/lib/__fixtures__/n43-sample";
import { localSupabase } from "./supabase";

export default async function globalSetup() {
  const sb = localSupabase();
  const admin = createClient(sb.url, sb.service, { auth: { persistSession: false } });
  await admin.storage.createBucket("case-files", { public: false }).catch(() => {});
  const email = `e2e-${Date.now()}@test.credia.local`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !u.user) throw error ?? new Error("createUser");
  const { data: lender } = await admin.from("lenders").insert({ name: "Fondo E2E" }).select("id").single();
  await admin.from("lender_members").insert({ lender_id: lender!.id, user_id: u.user.id, role: "owner" });

  const client = createClient(sb.url, sb.anon, { auth: { persistSession: false } });
  const { data: s, error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr || !s.session) throw sErr ?? new Error("signIn");

  // @supabase/ssr cookie: sb-<first label of the API host>-auth-token, "base64-" + base64url(JSON session), chunked.
  const name = `sb-${new URL(sb.url).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const chunks = value.match(/.{1,3180}/g)!;
  const cookies = (chunks.length === 1 ? [{ name, value }] : chunks.map((v, i) => ({ name: `${name}.${i}`, value: v }))).map((c) => ({
    ...c, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const,
  }));
  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync("e2e/.auth/lender.json", JSON.stringify({ cookies, origins: [] }));

  mkdirSync("e2e/.files", { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sumas");
  a3Rows.forEach((r) => ws.addRow(r));
  writeFileSync("e2e/.files/sumas-y-saldos-2025.xlsx", Buffer.from(await wb.xlsx.writeBuffer()));
  writeFileSync("e2e/.files/movimientos.n43", n43Sample, "latin1");
  // A minimal, valid one-page PDF: enough for the upload checks (header and end marker). It is not read (no API key).
  writeFileSync(
    "e2e/.files/cirbe.pdf",
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    "latin1",
  );
}
