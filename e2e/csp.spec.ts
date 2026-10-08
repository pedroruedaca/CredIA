/**
 * Content-Security-Policy (src/lib/csp.ts, set by the middleware): every kind of page, lender and company side, loads
 * with a nonce policy, every script carries that page's nonce, and the browser reports no violation. Run it against a
 * production build too (`E2E_PROD=1 npm run test:e2e`): dev mode allows eval, production does not.
 */
import { expect, test, type Page } from "@playwright/test";

/** Collects CSP violations from the moment the page starts loading. */
async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const refused: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) refused.push(m.text());
  });
  return refused;
}

async function expectCleanPage(page: Page, path: string, refused: string[]) {
  const res = await page.goto(path);
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp, path).toContain("frame-ancestors 'none'");
  const nonce = /'nonce-([^']+)'/.exec(csp)![1];
  await page.waitForLoadState("networkidle");
  // The dev server's overlay host is a <script> element that never runs; it does not exist in production.
  const scripts = await page.evaluate(() =>
    [...document.scripts].filter((s) => !s.hasAttribute("data-nextjs-dev-overlay")).map((s) => ({ src: s.src, nonce: s.nonce })),
  );
  expect(scripts.length, path).toBeGreaterThan(0);
  for (const s of scripts) expect(s.nonce, `${path} ${s.src || "inline"}`).toBe(nonce);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp), path).toEqual([]);
  expect(refused, path).toEqual([]);
}

test("lender pages load under the CSP with no violation", async ({ page }) => {
  const refused = await watchCsp(page);
  const company = `CSP E2E ${Date.now()}, S.L.`;
  await page.goto("/casos/nuevo");
  await page.getByLabel("CIF").fill("B12345674");
  await page.getByLabel("Razón social").fill(company);
  await page.getByLabel("Correo de la persona de contacto").fill("csp@e2e.test");
  await page.getByLabel("Cierre del último ejercicio").fill("2025-12-31");
  await page.getByLabel("Producto").selectOption("poliza_circulante");
  await page.getByLabel("Importe (€)").fill("100000");
  await page.getByLabel("Plazo (meses)").fill("12");
  const pill = page.getByRole("button", { name: "Contabilidad", exact: true });
  if ((await pill.getAttribute("aria-pressed")) !== "true") await pill.click();
  await page.getByRole("button", { name: "Crear caso" }).click();
  await expect(page.getByRole("heading", { name: /Caso creado/ })).toBeVisible();
  const link = await page.getByLabel("Enlace para la empresa").inputValue();
  await page.goto("/casos");
  await page.getByRole("link", { name: company, exact: true }).click();
  await expect(page).toHaveURL(/\/casos\/[0-9a-f-]{36}$/);
  const casePath = new URL(page.url()).pathname;

  for (const path of ["/casos", "/casos/nuevo", casePath, `${casePath}/tablas`, `${casePath}/vista-empresa`, `${casePath}/coste-de-ventas`, `${casePath}?personalizar=1`, "/bandeja", "/plantillas", "/ajustes", "/privacidad"]) {
    await expectCleanPage(page, path, refused);
  }

  // Company side, in a browser with no lender session: the landing page swaps the token, the portal loads.
  const companyCtx = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] }, locale: "es-ES" });
  const c = await companyCtx.newPage();
  const cRefused = await watchCsp(c);
  await c.goto(`/s#${new URL(link).hash.slice(1)}`);
  await c.waitForURL(/\/s\/[A-Za-z0-9_-]{16}$/);
  await expectCleanPage(c, new URL(c.url()).pathname, cRefused);
  await expectCleanPage(c, `${new URL(c.url()).pathname}?paso=trial_balance`, cRefused);
  await expectCleanPage(c, "/login", cRefused);
  await expectCleanPage(c, "/s", cRefused);
  await companyCtx.close();
});
