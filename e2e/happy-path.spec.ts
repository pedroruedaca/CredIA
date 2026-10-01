/**
 * Happy path: the lender creates a case asking for accounting + bank statements, the company opens its link and
 * uploads both, submits, and the lender sees the credit package (summary, KPIs, P&L, balance, checks, exports).
 */
import { expect, test, type Page } from "@playwright/test";

/** The file is listed and has finished uploading (the first upload also waits for the dev server to compile). */
async function uploaded(p: Page, name: string) {
  await expect(p.getByText(name).first()).toBeVisible();
  await expect(p.getByText("subiendo…")).toHaveCount(0, { timeout: 120_000 });
  await expect(p.getByRole("main")).not.toContainText(/no parece|no hemos podido|interrumpido/i);
}

test("lender creates a case, company uploads, lender sees the package", async ({ page, browser }) => {
  // --- Lender: new case, only Contabilidad + Norma 43 requested
  await page.goto("/casos/nuevo");
  await page.getByLabel("CIF").fill("B12345674");
  await page.getByLabel("Razón social").fill("Distribuciones E2E, S.L.");
  await page.getByLabel("Correo de la persona de contacto").fill("empresa@e2e.test");
  await page.getByLabel("Cierre del último ejercicio").fill("2025-12-31");
  await page.getByLabel("Producto").selectOption("poliza_circulante");
  await page.getByLabel("Importe (€)").fill("250000");
  await page.getByLabel("Plazo (meses)").fill("24");
  for (const label of ["Contabilidad", "Extractos bancarios (Norma 43)"]) {
    const pill = page.getByRole("button", { name: label, exact: true });
    if ((await pill.getAttribute("aria-pressed")) !== "true") await pill.click();
  }
  await page.getByRole("button", { name: "Crear caso" }).click();
  await expect(page.getByRole("heading", { name: /Caso creado/ })).toBeVisible();
  const url = await page.getByLabel("Enlace para la empresa").inputValue();
  expect(url).toMatch(/\/s\/[A-Za-z0-9_-]{43}$/);

  // --- Company: fresh browser (no lender session), uploads both files and submits
  const company = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "es-ES" });
  const c = await company.newPage();
  await c.goto(new URL(url).pathname);
  await expect(c.getByRole("heading", { level: 1 })).toBeVisible();

  await c.goto(`${new URL(url).pathname}?paso=trial_balance`);
  await c.getByRole("button", { name: /Subir sumas y saldos/ }).click();
  await c.locator('input[type="file"]').setInputFiles("e2e/.files/sumas-y-saldos-2025.xlsx");
  await uploaded(c, "sumas-y-saldos-2025.xlsx");

  await c.goto(`${new URL(url).pathname}?paso=norma43`);
  await c.locator('input[type="file"]').setInputFiles("e2e/.files/movimientos.n43");
  await uploaded(c, "movimientos.n43");

  // Processing runs in the background after each upload; the review step lists both as ready.
  await c.goto(`${new URL(url).pathname}?paso=enviar`);
  await expect(async () => {
    await c.reload();
    await expect(c.getByRole("button", { name: "Enviar documentación" })).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 90_000 });
  await c.getByRole("button", { name: "Enviar documentación" }).click();
  await expect(c.getByText(/Documentación enviada/)).toBeVisible();
  await company.close();

  // --- Lender: the case shows the package
  await page.goto("/casos");
  await page.getByRole("link", { name: "Distribuciones E2E, S.L.", exact: true }).click();
  await expect(page).toHaveURL(/\/casos\/[0-9a-f-]{36}$/);
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/Facturó 1,0 M€ en 2025 con un EBITDA de 110 k€/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 90_000 });

  const kpis = page.getByRole("region", { name: "Indicadores" });
  await expect(kpis.getByText("DSCR")).toBeVisible();
  await expect(kpis.getByText("1,59")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Cuenta de resultados 2025/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^EBITDA: 110 k€/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Balance a 31 dic 2025/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para revisar" })).toBeVisible();

  // Evidence panel opens from the list and keeps its deep link.
  await page.locator('a[href^="?check="]').first().click();
  await expect(page).toHaveURL(/\?check=/);
  await expect(page.getByRole("dialog")).toContainText("credIA verifica y organiza la información");

  // Exports work for the lender and every view is audited.
  const caseUrl = page.url().split("?")[0];
  for (const f of ["json", "xlsx", "pdf"]) {
    const r = await page.request.get(`${caseUrl}/exportar/${f}`);
    expect(r.status(), f).toBe(200);
  }
  const json = await (await page.request.get(`${caseUrl}/exportar/json`)).json();
  expect(json.disclaimer).toMatch(/no puntúa ni recomienda/);
  expect(json.kpis.closed_fy.find((k: { key: string }) => k.key === "ebitda").value).toBe(110000);
});
