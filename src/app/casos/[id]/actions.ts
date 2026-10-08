"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { findCandidates } from "@/lib/borme/case";
import { fetchSheetActs, STALE_FETCH_MS } from "@/lib/borme/ondemand";
import { caseHasRoom } from "@/lib/borrower/limits";
import { caseUsage } from "@/lib/borrower/rate";
import { checkDeclaredFile, cleanFilename, CONTENT_TYPES, contentMatchesExtension, MAX_UPLOAD_BYTES, parseUploadPath, uploadPath } from "@/lib/borrower/upload-rules";
import { REQUIREMENT_KINDS, REQUIREMENT_SPECS, type RequirementKind } from "@/lib/cases/requirements";
import { requireLender } from "@/lib/lender";
import { getNotifier, isEmailConfigured } from "@/lib/notify";
import { BANK_HOLDER_CHECK } from "@/lib/checks/engine";
import { processCase } from "@/lib/pipeline/process-case";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

const CaseId = z.string().regex(/^[0-9a-f-]{36}$/i);

const ReviewInput = z.object({
  caseId: CaseId,
  checkKey: z.string().regex(/^[A-Za-z0-9_]+(-\d+)?$/).max(80),
  status: z.enum(["open", "reviewed", "clarification_requested"]),
  note: z.string().max(2000).optional(),
});

/** "Marcar revisada" / "Pedir aclaración" / reopen: appends a review row (history kept) and audits it. */
export async function reviewCheck(input: z.input<typeof ReviewInput>): Promise<ActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  const parsed = ReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos no válidos." };
  const { caseId, checkKey, status } = parsed.data;
  const note = parsed.data.note?.trim() || null;

  const supabase = await createClient();
  // RLS: only returns the case if it belongs to this lender.
  const { data: kase } = await supabase.from("cases").select("id").eq("id", caseId).maybeSingle();
  if (!kase) return { ok: false, message: "Caso no encontrado." };

  const { error } = await supabase.from("check_reviews").insert({ case_id: caseId, lender_id: lender.lenderId, check_key: checkKey, status, note, user_id: lender.userId });
  if (error) return { ok: false, message: "No hemos podido guardar la revisión. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: caseId,
    actor: lender.userId,
    action: `check.${status}`,
    detail: { check_key: checkKey, has_note: note !== null },
  });
  // Reviewing «cuentas a nombre de otro titular» decides whether those accounts count: recompute the case.
  if (checkKey === BANK_HOLDER_CHECK) after(() => processCase(createAdminClient(), caseId));
  revalidatePath(`/casos/${caseId}`);
  return { ok: true };
}

const RequestInput = z.object({
  caseId: CaseId,
  kind: z.enum(REQUIREMENT_SPECS.map((s) => s.kind) as [string, ...string[]]),
  message: z.string().max(500).optional(),
});

/**
 * "Pedir documento": adds (or makes required) a requirement so it appears in the company's page, reopens the case
 * for documents, and emails the company when an address is on file. No new link is issued. A document the lender was
 * to obtain by CIF becomes the company's to upload ("Pedir a la empresa").
 */
export async function requestDocument(input: z.input<typeof RequestInput>): Promise<ActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  const parsed = RequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos no válidos." };
  const { caseId, kind } = parsed.data;
  const message = parsed.data.message?.trim() || null;

  const supabase = await createClient();
  const { data: kase } = await supabase
    .from("cases")
    .select("id, lender_id, status, borrower_name, borrower_email, consent_withdrawn_at")
    .eq("id", caseId)
    .maybeSingle();
  if (!kase) return { ok: false, message: "Caso no encontrado." };
  if (kase.status === "archived") return { ok: false, message: "El caso está archivado." };
  if (kase.consent_withdrawn_at) return { ok: false, message: "La empresa retiró su consentimiento; no se le pueden pedir más documentos." };

  const spec = REQUIREMENT_SPECS.find((s) => s.kind === kind)!;
  const { error } = await supabase
    .from("case_requirements")
    .upsert({ case_id: caseId, lender_id: kase.lender_id, doc_kind: kind, required: true, max_age_days: spec.defaultMaxAgeDays, source: "borrower" }, { onConflict: "case_id,doc_kind" });
  if (error) return { ok: false, message: "No hemos podido añadir el documento. Inténtalo de nuevo." };
  if (kase.status === "ready" || kase.status === "needs_review") {
    await supabase.from("cases").update({ status: "awaiting_documents", submitted_at: null }).eq("id", caseId);
  }
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    case_id: caseId,
    actor: lender.userId,
    action: "document.requested",
    detail: { doc_kind: kind, message },
  });

  let sent = false;
  if (kase.borrower_email) {
    ({ sent } = await getNotifier().sendDocumentRequest({
      to: kase.borrower_email,
      lenderName: lender.lenderName,
      companyName: kase.borrower_name ?? "",
      document: spec.label,
      message,
    }));
  }
  revalidatePath(`/casos/${caseId}`);
  return {
    ok: true,
    message: sent
      ? `Hemos avisado a la empresa por correo. ${spec.label} ya aparece en su página.`
      : kase.borrower_email && isEmailConfigured()
        ? `${spec.label} ya aparece en la página de la empresa, pero no se ha podido enviar el correo: avísala tú.`
        : `${spec.label} ya aparece en la página de la empresa. No hay correo configurado: avísala tú.`,
  };
}

const MatchInput = z.discriminatedUnion("status", [
  z.object({ caseId: CaseId, status: z.literal("confirmed"), sheet: z.string().regex(/^[A-Z]{1,3}-\d{1,7}$/) }),
  z.object({ caseId: CaseId, status: z.enum(["none", "clear"]) }),
]);

/**
 * "Es esta empresa" / "Ninguna es" / "Cambiar" in the Registro Mercantil section. Only a candidate found under the
 * case's company name can be confirmed. Confirming reads the company's acts from the BORME now (on demand, after
 * the response) unless they were already read; then the case is recomputed so the BORME checks appear.
 */
export async function setBormeMatch(input: z.input<typeof MatchInput>): Promise<ActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  const parsed = MatchInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos no válidos." };
  const { caseId } = parsed.data;

  const supabase = await createClient();
  const { data: kase } = await supabase.from("cases").select("id, lender_id, borrower_name").eq("id", caseId).maybeSingle();
  if (!kase) return { ok: false, message: "Caso no encontrado." };

  let error: { message: string } | null = null;
  let companyName: string | null = null;
  if (parsed.data.status === "clear") {
    ({ error } = await supabase.from("case_borme_matches").delete().eq("case_id", caseId));
  } else {
    if (parsed.data.status === "confirmed") {
      const sheet = parsed.data.sheet;
      const candidate = kase.borrower_name ? (await findCandidates(supabase, kase.borrower_name)).find((c) => c.sheet === sheet) : undefined;
      if (!candidate) return { ok: false, message: "Esa hoja registral no corresponde a la razón social del caso." };
      companyName = kase.borrower_name;
    }
    ({ error } = await supabase.from("case_borme_matches").upsert(
      {
        case_id: caseId,
        lender_id: kase.lender_id,
        status: parsed.data.status,
        registry_sheet: parsed.data.status === "confirmed" ? parsed.data.sheet : null,
        company_name: companyName,
        decided_by: lender.userId,
        decided_at: new Date().toISOString(),
      },
      { onConflict: "case_id" },
    ));
  }
  if (error) return { ok: false, message: "No hemos podido guardar la empresa. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({
    lender_id: kase.lender_id,
    case_id: caseId,
    actor: lender.userId,
    action: `borme.match_${parsed.data.status}`,
    detail: parsed.data.status === "confirmed" ? { registry_sheet: parsed.data.sheet } : {},
  });
  const admin = createAdminClient();
  if (parsed.data.status === "confirmed") await startSheetRead(admin, caseId, parsed.data.sheet);
  else after(() => processCase(admin, caseId));
  revalidatePath(`/casos/${caseId}`);
  return { ok: true };
}

/** Reads the company's acts unless already read (or being read); marks it "fetching" now so the view shows it. */
async function startSheetRead(admin: ReturnType<typeof createAdminClient>, caseId: string, sheet: string, force = false) {
  const { data: st } = await admin.from("borme_sheets").select("status, updated_at").eq("sheet", sheet).maybeSingle();
  const running = st?.status === "fetching" && Date.now() - new Date(st.updated_at).getTime() < STALE_FETCH_MS;
  if (running) return;
  if (st?.status === "ready" && !force) {
    after(() => processCase(admin, caseId));
    return;
  }
  await admin.from("borme_sheets").upsert({ sheet, status: "fetching", error: null, updated_at: new Date().toISOString() });
  after(async () => {
    await fetchSheetActs(admin, sheet);
    await processCase(admin, caseId);
  });
}

/** "Reintentar" / "Volver a consultar" on the confirmed company's BORME read. */
export async function refreshBormeSheet(caseId: string): Promise<ActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  if (!CaseId.safeParse(caseId).success) return { ok: false, message: "Datos no válidos." };
  const supabase = await createClient();
  const { data: match } = await supabase.from("case_borme_matches").select("status, registry_sheet").eq("case_id", caseId).maybeSingle();
  if (match?.status !== "confirmed" || !match.registry_sheet) return { ok: false, message: "Confirma primero la empresa." };
  await startSheetRead(createAdminClient(), caseId, match.registry_sheet, true);
  revalidatePath(`/casos/${caseId}`);
  return { ok: true };
}

/** Documents the lender's analyst can upload itself: any kind ("Lo subo yo", or one the company has not sent). */
const LENDER_UPLOAD_KINDS = REQUIREMENT_KINDS;
export type LenderUploadKind = RequirementKind;

const PrepareInput = z.object({ caseId: CaseId, kind: z.enum(LENDER_UPLOAD_KINDS), filename: z.string().min(1).max(255), size: z.number().int() });

/**
 * Lender upload, step 1 (same two steps as the company's portal): checks the declared file and returns a signed
 * upload URL, so the bytes go straight from the browser to Storage.
 */
export async function prepareLenderUpload(input: z.input<typeof PrepareInput>): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  const parsed = PrepareInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos no válidos." };
  const { caseId, kind, filename, size } = parsed.data;
  const { data: kase } = await (await createClient()).from("cases").select("id, status").eq("id", caseId).maybeSingle();
  if (!kase) return { ok: false, message: "Caso no encontrado." };
  if (kase.status === "archived") return { ok: false, message: "El caso está archivado." };
  const check = checkDeclaredFile(kind, filename, size);
  if (!check.ok) return { ok: false, message: check.message };
  const admin = createAdminClient();
  const room = caseHasRoom(await caseUsage(admin, caseId), size);
  if (!room.ok) return { ok: false, message: room.message };
  const { data, error } = await admin.storage.from("case-files").createSignedUploadUrl(uploadPath(caseId, kind, randomUUID(), check.ext));
  if (error || !data) return { ok: false, message: "No hemos podido preparar la subida. Inténtalo de nuevo." };
  return { ok: true, path: data.path, token: data.token };
}

const RegisterInput = z.object({ caseId: CaseId, path: z.string().min(1).max(300), filename: z.string().min(1).max(255) });

/**
 * Lender upload, step 2: checks the stored bytes, records the document as uploaded by the lender (the company's
 * portal does not show it) and processes the case after the response.
 */
export async function registerLenderUpload(input: z.input<typeof RegisterInput>): Promise<ActionResult> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar casos." };
  const parsed = RegisterInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos no válidos." };
  const { caseId, path } = parsed.data;
  const filename = cleanFilename(parsed.data.filename);
  const supabase = await createClient();
  const { data: kase } = await supabase.from("cases").select("id, lender_id").eq("id", caseId).maybeSingle();
  if (!kase) return { ok: false, message: "Caso no encontrado." };
  const target = parseUploadPath(caseId, path);
  if (!target || !(LENDER_UPLOAD_KINDS as readonly string[]).includes(target.kind)) return { ok: false, message: "Datos no válidos." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("documents").select("id").eq("storage_path", path).maybeSingle();
  if (existing) return { ok: true, message: "Ya lo habías subido." };
  const bucket = admin.storage.from("case-files");
  const reject = async (message: string): Promise<ActionResult> => {
    await bucket.remove([path]);
    return { ok: false, message };
  };
  const { data: blob, error: dlErr } = await bucket.download(path);
  if (dlErr || !blob) return { ok: false, message: "No hemos recibido el fichero. Vuelve a intentarlo." };
  if (blob.size > MAX_UPLOAD_BYTES) return reject(`«${filename}» ocupa más de 20 MB.`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!contentMatchesExtension(bytes, target.ext)) return reject(`«${filename}» no parece un fichero .${target.ext} válido.`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const { data: doc, error } = await admin
    .from("documents")
    .insert({
      case_id: caseId,
      lender_id: kase.lender_id,
      kind: target.kind,
      storage_path: path,
      sha256,
      original_filename: filename,
      size_bytes: bytes.length,
      content_type: CONTENT_TYPES[target.ext],
      uploaded_by: "lender",
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    await bucket.remove([path]);
    return { ok: true, message: "Este documento ya estaba en el caso." };
  }
  if (error || !doc) return reject("No hemos podido guardar el documento. Inténtalo de nuevo.");

  await supabase.from("audit_log").insert({
    lender_id: kase.lender_id,
    case_id: caseId,
    actor: lender.userId,
    action: "document.uploaded",
    detail: { document_id: doc.id, kind: target.kind, sha256, size: bytes.length, by: "lender" },
  });
  after(() => processCase(admin, caseId));
  revalidatePath(`/casos/${caseId}`);
  return { ok: true };
}
