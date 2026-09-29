/**
 * Magic links against the real database: the company's link, "Nuevo enlace" replacing it, expiry, archived
 * cases, gestoría (delegate) links, and withdrawn consent. Also: lender reads are audit-logged once per window.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { borrowerRoute, resolveBorrowerAccess } from "../../src/lib/borrower/access.ts";
import { logCaseRead } from "../../src/lib/lender-audit.ts";
import { generateMagicLinkToken } from "../../src/lib/magic-link.ts";
import { admin, makeLender, must } from "./env.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let L: Lender;

async function newCase(extra: Record<string, unknown> = {}) {
  const { token, hash, expiresAt } = generateMagicLinkToken();
  const kase = must(
    await admin.from("cases").insert({ lender_id: L.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa", fiscal_year_end: "2025-12-31", borrower_token_hash: hash, borrower_token_expires_at: expiresAt, ...extra }).select("id").single(),
  ) as { id: string };
  return { id: kase.id, token };
}

async function newDelegate(caseId: string, extra: Record<string, unknown> = {}) {
  const { token, hash, expiresAt } = generateMagicLinkToken();
  must(await admin.from("delegate_links").insert({ case_id: caseId, lender_id: L.lenderId, email: "gestoria@x.es", token_hash: hash, expires_at: expiresAt, ...extra }));
  return token;
}

beforeAll(async () => {
  L = await makeLender("Fondo Enlaces");
});

describe("company link", () => {
  it("resolves a valid link to its case", async () => {
    const c = await newCase();
    const r = await resolveBorrowerAccess(admin as never, c.token);
    expect(r).toMatchObject({ ok: true, access: { caseId: c.id, lenderId: L.lenderId, actor: "borrower", consentWithdrawn: false } });
  });

  it("rejects malformed and unknown tokens without a lookup hit", async () => {
    expect(await resolveBorrowerAccess(admin as never, "abc")).toEqual({ ok: false, reason: "invalid" });
    expect(await resolveBorrowerAccess(admin as never, generateMagicLinkToken().token)).toEqual({ ok: false, reason: "invalid" });
  });

  it("treats an expired link as expired, also at the exact expiry instant", async () => {
    const past = await newCase({ borrower_token_expires_at: new Date(Date.now() - 60_000).toISOString() });
    expect(await resolveBorrowerAccess(admin as never, past.token)).toEqual({ ok: false, reason: "expired" });
    const c = await newCase();
    const { borrower_token_expires_at } = must(await admin.from("cases").select("borrower_token_expires_at").eq("id", c.id).single()) as { borrower_token_expires_at: string };
    expect(await resolveBorrowerAccess(admin as never, c.token, new Date(borrower_token_expires_at))).toEqual({ ok: false, reason: "expired" });
  });

  it('"Nuevo enlace": the old link stops working, the new one works', async () => {
    const c = await newCase();
    const fresh = generateMagicLinkToken();
    must(await admin.from("cases").update({ borrower_token_hash: fresh.hash, borrower_token_expires_at: fresh.expiresAt }).eq("id", c.id));
    expect(await resolveBorrowerAccess(admin as never, c.token)).toEqual({ ok: false, reason: "invalid" });
    expect(await resolveBorrowerAccess(admin as never, fresh.token)).toMatchObject({ ok: true, access: { caseId: c.id } });
  });

  it("an archived case's link no longer works", async () => {
    const c = await newCase({ status: "archived" });
    expect(await resolveBorrowerAccess(admin as never, c.token)).toEqual({ ok: false, reason: "expired" });
  });

  it("after consent is withdrawn the link resolves (to show the message) but API routes refuse with 409", async () => {
    const c = await newCase({ consent_withdrawn_at: new Date().toISOString() });
    expect(await resolveBorrowerAccess(admin as never, c.token)).toMatchObject({ ok: true, access: { consentWithdrawn: true } });
    const route = await borrowerRoute(c.token);
    expect(route.response?.status).toBe(409);
    const bad = await borrowerRoute("x".repeat(43));
    expect(bad.response?.status).toBe(404);
  });
});

describe("gestoría (delegate) links", () => {
  it("a valid delegate link resolves as the delegate", async () => {
    const c = await newCase();
    const token = await newDelegate(c.id);
    expect(await resolveBorrowerAccess(admin as never, token)).toMatchObject({ ok: true, access: { caseId: c.id, actor: "delegate", delegateEmail: "gestoria@x.es" } });
  });

  it("revoked or expired delegate links stop working", async () => {
    const c = await newCase();
    const revoked = await newDelegate(c.id, { revoked_at: new Date().toISOString() });
    const expired = await newDelegate(c.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(await resolveBorrowerAccess(admin as never, revoked)).toEqual({ ok: false, reason: "expired" });
    expect(await resolveBorrowerAccess(admin as never, expired)).toEqual({ ok: false, reason: "expired" });
  });

  it("delegate links die with the case: archived, or consent withdrawn by the company", async () => {
    const archived = await newCase({ status: "archived" });
    expect(await resolveBorrowerAccess(admin as never, await newDelegate(archived.id))).toEqual({ ok: false, reason: "expired" });
    const withdrawn = await newCase({ consent_withdrawn_at: new Date().toISOString() });
    const token = await newDelegate(withdrawn.id);
    expect(await resolveBorrowerAccess(admin as never, token)).toMatchObject({ ok: true, access: { consentWithdrawn: true } });
    expect((await borrowerRoute(token)).response?.status).toBe(409);
  });
});

describe("lender read audit", () => {
  it("records a case view once per 15-minute window per person", async () => {
    const c = await newCase();
    const t0 = new Date();
    await logCaseRead(L.db, L, c.id, "case.viewed", t0);
    await logCaseRead(L.db, L, c.id, "case.viewed", new Date(t0.getTime() + 60_000));
    await logCaseRead(L.db, L, c.id, "case.tables_viewed", t0);
    const rows = must(await admin.from("audit_log").select("action, actor").eq("case_id", c.id)) as { action: string; actor: string }[];
    expect(rows.filter((r) => r.action === "case.viewed")).toHaveLength(1);
    expect(rows.filter((r) => r.action === "case.tables_viewed")).toHaveLength(1);
    expect(rows.every((r) => r.actor === L.userId)).toBe(true);
  });

  it("cannot log a read on another lender's case", async () => {
    const other = await makeLender("Otro Fondo");
    const c = await newCase();
    await logCaseRead(other.db, other, c.id, "case.viewed");
    expect((await admin.from("audit_log").select("id").eq("case_id", c.id).eq("actor", other.userId)).data).toEqual([]);
  });
});
