/**
 * Bank movements from an Excel/CSV export (not Norma 43): the analyst uploads a CSV in the shape Spanish online
 * banking exports; the pipeline reads it, checks it adds up and the package gets its bank KPIs.
 */
import { expect, test } from "@playwright/test";
import { csvNewestFirst } from "../src/lib/__fixtures__/bank-statements";

test("a CSV bank export is read, reconciled and gives the bank KPIs", async ({ page }) => {
  const company = `Banco CSV E2E ${Date.now()}, S.L.`;
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
