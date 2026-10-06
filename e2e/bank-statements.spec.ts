/**
 * Bank movements from an Excel/CSV export (not Norma 43): the analyst uploads a CSV in the shape Spanish online
 * banking exports; the pipeline reads it, checks it adds up and the package gets its bank KPIs.
 */
import { expect, test } from "@playwright/test";
import { type Page } from "@playwright/test";
import { csvNewestFirst, HOLDER } from "../src/lib/__fixtures__/bank-statements";

/** A case whose bank movements the analyst uploads («Lo subo yo»); returns its URL. */
async function bankCase(page: Page, company: string) {
  await page.goto("/casos/nuevo");
  await page.getByLabel("CIF").fill("B12345674");
  await page.getByLabel("Razón social").fill(company);
  await page.getByLabel("Correo de la persona de contacto").fill("banco@e2e.test");
  await page.getByLabel("Cierre del último ejercicio").fill("2025-12-31");
  await page.getByLabel("Producto").selectOption("poliza_circulante");
  await page.getByLabel("Importe (€)").fill("60000");
  await page.getByLabel("Plazo (meses)").fill("12");
  await page.getByRole("button", { name: "Extractos bancarios (Norma 43)", exact: true }).click();
  await page.getByRole("group", { name: /^Extractos bancarios/ }).getByRole("button", { name: "Lo subo yo" }).click();
  await page.getByRole("button", { name: "Crear caso" }).click();
  await page.getByRole("link", { name: "Ir al caso" }).click();
  await expect(page).toHaveURL(/\/casos\/[0-9a-f-]{36}$/);
  return page.url();
}

/** Uploads a CSV as the analyst and waits until it is stored. */
async function upload(page: Page, name: string, csv: string) {
  const section = page.getByRole("region", { name: "Documentos que subes tú" });
  await section.locator('input[type="file"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(csv, "latin1") });
  await expect(section).toContainText(name, { timeout: 60_000 });
}

test("an account held by someone else stays out until the analyst confirms it; a person's account is rejected", async ({ page }) => {
  const caseUrl = await bankCase(page, `Comercial Distribuciones Levante E2E ${Date.now()}, S.L.`);
  // Held by a different name (no ID printed): read, but not used, and «Para revisar» says why.
  await upload(page, "otra-cuenta.csv", csvNewestFirst().replace(`Titular;${HOLDER}`, "Titular;JUAN GARCIA LOPEZ"));
  const alert = page.getByRole("link", { name: /a nombre de otro titular/ });
  await expect(async () => {
    await page.reload();
    await expect(alert).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 90_000 });
  expect((await (await page.request.get(`${caseUrl}/exportar/json`)).json()).bank_kpis).toBeNull();

  // The analyst confirms it is the company's: the case is recomputed and the account counts.
  await alert.click();
  await page.getByRole("button", { name: "Marcar revisada" }).click();
  await expect(async () => {
    const json = await (await page.request.get(`${caseUrl}/exportar/json`)).json();
    expect(json.bank_kpis?.accounts).toBe(1);
  }).toPass({ timeout: 90_000 });

  // A person's account (DNI as the holder's ID) is not read at all.
  await page.goto(caseUrl);
  await upload(page, "personal.csv", csvNewestFirst().replace(`Titular;${HOLDER}`, "Titular;JUAN GARCIA LOPEZ;NIF 12345678Z"));
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("region", { name: "Documentos que subes tú" })).toContainText("es de una cuenta personal", { timeout: 2_000 });
  }).toPass({ timeout: 90_000 });
});

test("a CSV bank export is read, reconciled and gives the bank KPIs", async ({ page }) => {
  // Named as the statement's holder: an account held by someone else would stay out of the figures.
  const company = `Comercial Distribuciones Levante, S.L.`;
  await page.goto("/casos/nuevo");
  await page.getByLabel("CIF").fill("B12345674");
  await page.getByLabel("Razón social").fill(company);
  await page.getByLabel("Correo de la persona de contacto").fill("banco@e2e.test");
  await page.getByLabel("Cierre del último ejercicio").fill("2025-12-31");
  await page.getByLabel("Producto").selectOption("poliza_circulante");
  await page.getByLabel("Importe (€)").fill("60000");
  await page.getByLabel("Plazo (meses)").fill("12");
  await page.getByRole("button", { name: "Extractos bancarios (Norma 43)", exact: true }).click();
  await page.getByRole("group", { name: /^Extractos bancarios/ }).getByRole("button", { name: "Lo subo yo" }).click();
  await page.getByRole("button", { name: "Crear caso" }).click();
  await page.getByRole("link", { name: "Ir al caso" }).click();
  await expect(page).toHaveURL(/\/casos\/[0-9a-f-]{36}$/);
  const caseUrl = page.url();

  const section = page.getByRole("region", { name: "Documentos que subes tú" });
  await section.locator('input[type="file"]').setInputFiles({ name: "movimientos.csv", mimeType: "text/csv", buffer: Buffer.from(csvNewestFirst(), "latin1") });
  await expect(section).toContainText("movimientos.csv", { timeout: 60_000 });

  // Processed: the export carries the bank KPIs, built from this file.
  await expect(async () => {
    const json = await (await page.request.get(`${caseUrl}/exportar/json`)).json();
    expect(json.bank_kpis?.accounts).toBe(1);
  }).toPass({ timeout: 90_000 });
  const json = await (await page.request.get(`${caseUrl}/exportar/json`)).json();
  expect(json.bank_kpis.period).toMatchObject({ start: "2026-01-02", end: "2026-03-31" });
  expect(json.bank_kpis.kpis.find((k: { key: string }) => k.key === "payrollRegularity").value).toBe(100);
  expect(json.bank_kpis.kpis.find((k: { key: string }) => k.key === "overdraftDays").value).toBeGreaterThan(0); // it ends overdrawn
});
