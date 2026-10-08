import { describe, expect, it } from "vitest";
import { ORPHAN_MIN_AGE_MS, orphanPaths } from "./orphan-uploads.ts";

describe("orphanPaths", () => {
  const now = new Date("2026-10-08T12:00:00Z").getTime();
  const old = new Date(now - ORPHAN_MIN_AGE_MS - 1000).toISOString();
  const fresh = new Date(now - 60_000).toISOString();
  it("picks files no document names, once they are old enough", () => {
    const stored = [
      { path: "cases/c/cirbe/a.pdf", createdAt: old }, // registered
      { path: "cases/c/cirbe/b.pdf", createdAt: old }, // orphan
      { path: "cases/c/cirbe/c.pdf", createdAt: fresh }, // upload maybe still in progress
      { path: "cases/c/cirbe/d.pdf", createdAt: null }, // unknown age: keep
    ];
    expect(orphanPaths(stored, new Set(["cases/c/cirbe/a.pdf"]), now)).toEqual(["cases/c/cirbe/b.pdf"]);
  });
});
