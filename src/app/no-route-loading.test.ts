/**
 * No `loading.tsx` route boundaries. With one (Next 15.5), the page a server action or `router.refresh()` sends back
 * streams in behind the boundary and, about half the time, the browser never shows it: «Cerrar caso», «Guardar diseño»
 * or an upload succeeded but the page kept its old state until a reload. Production builds only; `next dev` hides it.
 * Reproduced with `E2E_PROD=1 npm run test:e2e`. Use `Skeleton` inside a component's own client state instead.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? routeFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

describe("app routes", () => {
  it("have no loading.tsx boundary", () => {
    const appDir = join(import.meta.dirname, ".");
    const loading = routeFiles(appDir).filter((f) => /(^|\/)loading\.(tsx|ts|jsx|js)$/.test(f)).map((f) => relative(appDir, f));
    expect(loading).toEqual([]);
  });
});
