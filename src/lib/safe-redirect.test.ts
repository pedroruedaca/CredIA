import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect.ts";

describe("safeNextPath", () => {
  it("keeps relative paths", () => expect(safeNextPath("/casos/nuevo")).toBe("/casos/nuevo"));
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBe("/casos");
    expect(safeNextPath("//evil.example")).toBe("/casos");
    expect(safeNextPath("/\\evil.example")).toBe("/casos");
  });
  it("falls back when missing", () => expect(safeNextPath(null)).toBe("/casos"));
});
