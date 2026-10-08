import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect.ts";

describe("safeNextPath", () => {
  it("keeps relative paths", () => expect(safeNextPath("/casos/nuevo")).toBe("/casos/nuevo"));
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBe("/casos");
    expect(safeNextPath("//evil.example")).toBe("/casos");
    expect(safeNextPath("/\\evil.example")).toBe("/casos");
  });
  it("rejects paths a URL parser turns into another site (tabs, newlines, backslashes)", () => {
    expect(safeNextPath("/\t/evil.example")).toBe("/casos");
    expect(safeNextPath("/\n/evil.example")).toBe("/casos");
    expect(safeNextPath("/\r//evil.example")).toBe("/casos");
    expect(safeNextPath("/casos\\..\\/evil.example")).toBe("/casos");
  });
  it("keeps query strings and fragments", () => expect(safeNextPath("/casos?filtro=atencion#x")).toBe("/casos?filtro=atencion#x"));
  it("falls back when missing", () => expect(safeNextPath(null)).toBe("/casos"));
});
