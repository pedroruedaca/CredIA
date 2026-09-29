/**
 * Turns a Claude extraction into (a) a decision about the uploaded document and (b) the canonical, Zod-validated
 * data. Pure. A wrong document type, another company's CIF, a wrong fiscal year or an unreadable scan fails the
 * document with a borrower-facing fix message; the checklist shows it and the borrower re-uploads.
 */
import { DOC_TYPE_LABEL } from "../../content/extraction.es.ts";
import { isValidCif, normalizeCif } from "../cif.ts";
import {
  CertificateExtractionSchema,
  CirbeExtractionSchema,
  Modelo200ExtractionSchema,
  type CertificateExtraction,
  type CirbeExtraction,
  type Modelo200Extraction,
} from "../schema/canonical.ts";
import type { Warning } from "../types.ts";
import type { AccountsWire, CertificateWire, CirbeWire, ExtractKind } from "./schemas.ts";

export interface AssessContext {
  fileName: string;
  caseCif: string;
  companyName: string;
  lenderName: string;
  /** Ejercicio expected for Modelo 200 / cuentas anuales (year the closed fiscal year starts), if known. */
  expectedFiscalYear: number | null;
}

export type Canonical =
  | { kind: "accounts"; data: Modelo200Extraction; periodEnd: string | null }
  | { kind: "cirbe"; data: CirbeExtraction }
  | { kind: "certificate"; data: CertificateExtraction };

export interface Assessment {
  status: "parsed" | "failed" | "needs_review";
  /** Borrower-facing fix when status is failed or needs_review. */
  attentionMessage: string | null;
  /** Issue/as-of date for freshness rules (certificates, CIRBE). */
  issuedOn: string | null;
  canonical: Canonical | null;
  warnings: Warning[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoOrNull = (s: string | null | undefined) => (s && ISO.test(s) ? s : null);

/** "ES-B12345674", "b 1234567-4" → "B12345674". */
export function cleanNif(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = normalizeCif(raw).replace(/[^A-Z0-9]/g, "").replace(/^ES(?=[A-Z0-9]{9}$)/, "");
  return n || null;
}

const fail = (attentionMessage: string, warnings: Warning[] = []): Assessment => ({ status: "failed", attentionMessage, issuedOn: null, canonical: null, warnings });

type Wire = AccountsWire | CirbeWire | CertificateWire;

/** Checks shared by every kind: legible, right document, right company. */
function identity(kind: ExtractKind, wire: Wire, ctx: AssessContext): Assessment | Warning[] {
  const warnings: Warning[] = [];
  if (!wire.legible) {
    return fail(`No se lee bien «${ctx.fileName}». Sube el PDF original descargado de la sede electrónica, no una foto o un escaneo.`);
  }
  if (wire.document_type !== kind) {
    const got = DOC_TYPE_LABEL[wire.document_type] ?? DOC_TYPE_LABEL.other;
    return fail(`«${ctx.fileName}» parece ${got}, no ${DOC_TYPE_LABEL[kind]}. Súbelo en el paso que le corresponde y aquí sube ${DOC_TYPE_LABEL[kind]}.`, [
      { code: "doc_type_mismatch", message: `Expected ${kind}, got ${wire.document_type}`, detail: { expected: kind, detected: wire.document_type } },
    ]);
  }
  const nif = cleanNif(wire.company_nif);
  const expected = cleanNif(ctx.caseCif);
  if (!nif) {
    warnings.push({ code: "doc_nif_missing", message: "No se ha encontrado el NIF de la empresa en el documento." });
  } else if (isValidCif(nif) && expected && nif !== expected) {
    return fail(`«${ctx.fileName}» es de otra empresa (NIF ${nif}). Necesitamos el de ${ctx.companyName} (${expected}).`, [
      { code: "doc_nif_mismatch", message: `NIF ${nif} does not match case CIF ${expected}`, detail: { found: nif, expected } },
    ]);
  } else if (!isValidCif(nif)) {
    warnings.push({ code: "doc_nif_unreadable", message: `NIF leído «${nif}» no es un CIF válido; no se ha podido comprobar la empresa.`, detail: { found: nif } });
  }
  return warnings;
}

function accounts(kind: "modelo200" | "cuentas_anuales", w: AccountsWire, ctx: AssessContext, warnings: Warning[]): Assessment {
  if (ctx.expectedFiscalYear && w.fiscal_year && w.fiscal_year !== ctx.expectedFiscalYear) {
    const what = kind === "modelo200" ? "el Modelo 200" : "las cuentas anuales";
    return fail(`«${ctx.fileName}» es ${what} del ejercicio ${w.fiscal_year}. ${ctx.lenderName} necesita ${what} del ejercicio ${ctx.expectedFiscalYear}.`, [
      ...warnings,
      { code: "doc_fiscal_year_mismatch", message: `Fiscal year ${w.fiscal_year}, expected ${ctx.expectedFiscalYear}`, detail: { found: w.fiscal_year, expected: ctx.expectedFiscalYear } },
    ]);
  }
  const keys = { revenue: w.revenue, operatingResult: w.operating_result, preTaxResult: w.pre_tax_result, netIncome: w.net_income, equity: w.equity, totalAssets: w.total_assets };
  const fields = Object.fromEntries(Object.entries(keys).map(([k, f]) => [k, f.value])) as Modelo200Extraction["fields"];
  const sourcePages = Object.fromEntries(
    Object.entries(keys).filter(([, f]) => f.value !== null && f.page !== null && f.page > 0).map(([k, f]) => [k, f.page as number]),
  );
  const missingPages = Object.entries(keys).filter(([, f]) => f.value !== null && !(f.page && f.page > 0)).map(([k]) => k);
  if (missingPages.length) warnings.push({ code: "extract_missing_page", message: `Sin página de origen: ${missingPages.join(", ")}.`, detail: { fields: missingPages } });

  const parsed = Modelo200ExtractionSchema.safeParse({
    nif: cleanNif(w.company_nif) ?? cleanNif(ctx.caseCif) ?? "",
    fiscalYear: w.fiscal_year ?? ctx.expectedFiscalYear ?? 0,
    fields,
    sourcePages,
  });
  if (!parsed.success) return { status: "needs_review", attentionMessage: null, issuedOn: null, canonical: null, warnings: [...warnings, { code: "extract_invalid", message: parsed.error.message }] };
  if (Object.values(fields).every((v) => v === null)) {
    return fail(`No encontramos cifras en «${ctx.fileName}». Sube la declaración completa, con el balance y la cuenta de resultados.`, warnings);
  }
  return { status: "parsed", attentionMessage: null, issuedOn: null, canonical: { kind: "accounts", data: parsed.data, periodEnd: isoOrNull(w.period_end) }, warnings };
}

function cirbe(w: CirbeWire, ctx: AssessContext, warnings: Warning[]): Assessment {
  const asOf = isoOrNull(w.as_of);
  if (!asOf) {
    return {
      status: "needs_review",
      attentionMessage: `No encontramos la fecha de los datos en «${ctx.fileName}». Sube el informe CIRBE completo, tal como lo descargas del Banco de España.`,
      issuedOn: null,
      canonical: null,
      warnings: [...warnings, { code: "cirbe_no_date", message: "No se ha encontrado la fecha de los datos del informe CIRBE." }],
    };
  }
  const parsed = CirbeExtractionSchema.safeParse({
    nif: cleanNif(w.company_nif) ?? cleanNif(ctx.caseCif) ?? "",
    asOf,
    positions: w.positions.map((p) => ({ entity: p.entity, product: p.product, drawn: p.drawn, limit: p.limit, overdue: p.overdue ?? 0, maturity: p.maturity, page: p.page })),
  });
  if (!parsed.success) return { status: "needs_review", attentionMessage: null, issuedOn: asOf, canonical: null, warnings: [...warnings, { code: "extract_invalid", message: parsed.error.message }] };
  return { status: "parsed", attentionMessage: null, issuedOn: asOf, canonical: { kind: "cirbe", data: parsed.data }, warnings };
}

function certificate(kind: "aeat_cert" | "tgss_cert", w: CertificateWire, ctx: AssessContext, warnings: Warning[]): Assessment {
  const issuedOn = isoOrNull(w.issue_date);
  if (!issuedOn) {
    return {
      status: "needs_review",
      attentionMessage: `No encontramos la fecha de emisión en «${ctx.fileName}». Sube el certificado completo, tal como lo descargas de la sede electrónica.`,
      issuedOn: null,
      canonical: null,
      warnings: [...warnings, { code: "cert_no_date", message: "No se ha encontrado la fecha de emisión del certificado." }],
    };
  }
  const parsed = CertificateExtractionSchema.safeParse({
    nif: cleanNif(w.company_nif) ?? cleanNif(ctx.caseCif) ?? "",
    issuer: kind === "aeat_cert" ? "aeat" : "tgss",
    issuedOn,
    validUntil: isoOrNull(w.valid_until),
    result: w.result,
    verificationCode: w.verification_code,
    page: w.page && w.page > 0 ? w.page : null,
  });
  if (!parsed.success) return { status: "needs_review", attentionMessage: null, issuedOn, canonical: null, warnings: [...warnings, { code: "extract_invalid", message: parsed.error.message }] };
  // A negative certificate is a fact for the lender (a check), not something the borrower can fix by re-uploading.
  if (w.result === "no_al_corriente") warnings.push({ code: "cert_negative", message: "El certificado indica que la empresa no está al corriente." });
  return { status: "parsed", attentionMessage: null, issuedOn, canonical: { kind: "certificate", data: parsed.data }, warnings };
}

export function assessExtraction(kind: ExtractKind, wire: Wire, ctx: AssessContext): Assessment {
  const id = identity(kind, wire, ctx);
  if (!Array.isArray(id)) return id;
  switch (kind) {
    case "modelo200":
    case "cuentas_anuales":
      return accounts(kind, wire as AccountsWire, ctx, id);
    case "cirbe":
      return cirbe(wire as CirbeWire, ctx, id);
    case "aeat_cert":
    case "tgss_cert":
      return certificate(kind, wire as CertificateWire, ctx, id);
  }
}
