/**
 * «Eliminar entidad» (/admin) against the real database and storage: the lender, its cases and their files, its
 * members' accounts go; another lender and a platform admin's account are untouched.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeLender, must } from "./env.ts";
import { deleteLenderEverything } from "../../src/lib/platform/store.ts";

type Lender = Awaited<ReturnType<typeof makeLender>>;
let gone: Lender;
let other: Lender;
let adminUserId: string;
const BUCKET = "case-files";

async function caseWithFile(l: Lender) {
  const id = (must(await admin.from("cases").insert({ lender_id: l.lenderId, borrower_cif: "B12345674", borrower_name: "Empresa" }).select("id").single()) as { id: string }).id;
  const path = `cases/${id}/cirbe/00000000-0000-4000-8000-000000000001.pdf`;
  must(await admin.storage.from(BUCKET).upload(path, new TextEncoder().encode("%PDF-1.4 test %%EOF"), { upsert: true }));
  must(await admin.from("documents").insert({ case_id: id, lender_id: l.lenderId, kind: "cirbe", storage_path: path, sha256: crypto.randomUUID(), original_filename: "cirbe.pdf", uploaded_by: "lender" }));
  return { id, path };
}

const fileExists = async (path: string) => {
  const [dir, name] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
  return ((await admin.storage.from(BUCKET).list(dir)).data ?? []).some((f) => f.name === name);
};

beforeAll(async () => {
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  gone = await makeLender("Fondo Que Se Va");
  other = await makeLender("Fondo Que Se Queda");
  // A platform admin who is also in the deleted lender keeps their account.
  const email = `admin-${crypto.randomUUID().slice(0, 8)}@test.credia.local`;
  adminUserId = (must(await admin.auth.admin.createUser({ email, email_confirm: true })) as { user: { id: string } }).user.id;
  must(await admin.from("lender_members").insert({ lender_id: gone.lenderId, user_id: adminUserId, role: "owner" }));
  process.env.CREDIA_ADMIN_EMAILS = email;
});

describe("delete a lender", () => {
  it("removes the lender, its cases, their files and its members' accounts; nothing of other lenders", async () => {
    const mine = await caseWithFile(gone);
    const theirs = await caseWithFile(other);

    const r = await deleteLenderEverything(gone.lenderId);
    expect(r).toMatchObject({ ok: true, name: "Fondo Que Se Va", cases: 1, filesRemoved: 1, accountsRemoved: 1, accountsKept: 1 });

    expect(must(await admin.from("lenders").select("id").eq("id", gone.lenderId))).toEqual([]);
    expect(must(await admin.from("cases").select("id").eq("id", mine.id))).toEqual([]);
    expect(must(await admin.from("documents").select("id").eq("lender_id", gone.lenderId))).toEqual([]);
    expect(await fileExists(mine.path)).toBe(false);
    expect((await admin.auth.admin.getUserById(gone.userId)).data.user).toBeNull();
    expect((await admin.auth.admin.getUserById(adminUserId)).data.user?.id).toBe(adminUserId);

    expect(must(await admin.from("cases").select("id").eq("id", theirs.id))).toHaveLength(1);
    expect(await fileExists(theirs.path)).toBe(true);
    expect((await admin.auth.admin.getUserById(other.userId)).data.user?.id).toBe(other.userId);
  });

  it("says so when the lender no longer exists", async () => {
    expect(await deleteLenderEverything(gone.lenderId)).toEqual({ ok: false, message: "Esa entidad ya no existe." });
  });
});
