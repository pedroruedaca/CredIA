import { describe, expect, it } from "vitest";
import { caseHasRoom, MAX_CASE_BYTES, MAX_DOCUMENTS_PER_CASE, rateKey } from "./limits.ts";

describe("caseHasRoom", () => {
  it("accepts a file while the case is under both limits", () => {
    expect(caseHasRoom({ count: 0, bytes: 0 }, 20 * 1024 * 1024)).toEqual({ ok: true });
    expect(caseHasRoom({ count: MAX_DOCUMENTS_PER_CASE - 1, bytes: MAX_CASE_BYTES - 1000 }, 1000)).toEqual({ ok: true });
  });
  it("refuses at the document limit or past the byte budget", () => {
    expect(caseHasRoom({ count: MAX_DOCUMENTS_PER_CASE, bytes: 0 }, 1).ok).toBe(false);
    expect(caseHasRoom({ count: 3, bytes: MAX_CASE_BYTES - 1000 }, 1001).ok).toBe(false);
  });
});

describe("rateKey", () => {
  it("counts each link holder apart, and the case-wide upload limit across them", () => {
    expect(rateKey("upload", { caseId: "c1", delegateId: null })).toBe("upload:c1:company");
    expect(rateKey("upload", { caseId: "c1", delegateId: "d9" })).toBe("upload:c1:d9");
    expect(rateKey("uploadCase", { caseId: "c1", delegateId: "d9" })).toBe("uploadCase:c1");
  });
});
