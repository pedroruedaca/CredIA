import { describe, expect, it } from "vitest";
import { casePrefixes, confirmsDeletion, filesToRemove } from "./deletion.ts";

const CASE = "3f2a91c0-1111-4222-8333-444455556666";
const OTHER = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";

describe("deleting a case", () => {
  it("is confirmed only by the case's own CIF (spaces, dashes and case ignored)", () => {
    expect(confirmsDeletion("b-1234567 4", "B12345674")).toBe(true);
    expect(confirmsDeletion("B12345675", "B12345674")).toBe(false);
    expect(confirmsDeletion("", "B12345674")).toBe(false);
    expect(confirmsDeletion("   ", "")).toBe(false);
  });

  it("removes every file under the case's own folders and the paths its rows name, never another case's", () => {
    expect(casePrefixes(CASE)).toEqual([`cases/${CASE}`, `raw/holded/${CASE}`, `exports/${CASE}`]);
    const listed = [`cases/${CASE}/norma43/a.n43`, `raw/holded/${CASE}/s1.json`, `cases/${CASE}/cirbe/b.pdf`];
    const named = [`cases/${CASE}/cirbe/b.pdf`, `cases/${CASE}/memo/m.pdf`, null, `cases/${OTHER}/cirbe/x.pdf`, `cases/${CASE}x/evil.pdf`];
    expect(filesToRemove(CASE, listed, named)).toEqual([
      `cases/${CASE}/cirbe/b.pdf`,
      `cases/${CASE}/memo/m.pdf`,
      `cases/${CASE}/norma43/a.n43`,
      `raw/holded/${CASE}/s1.json`,
    ]);
  });
});
