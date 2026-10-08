/**
 * «Cerrar caso» and «Conservación de datos» end to end: the analyst closes a case with a reason, the header says when
 * it will be deleted, the case moves to «Cerrados», and «Reabrir caso» brings it back. The owner sets the retention
 * period in Ajustes and the closed case shows the new date.
 */
import { expect, test } from "@playwright/test";

test("close a case, find it under «Cerrados», change the retention period, reopen it", async ({ page }) => {
  const company = `Cierre E2E ${Date.now()}, S.L.`;
  await page.goto("/casos/nuevo");
  await page.getByLabel("CIF").fill("B12345674");
  await page.getByLabel("Razón social").fill(company);
  await page.getByLabel("Correo de la persona de contacto").fill("cierre@e2e.test");
  await page.getByLabel("Cierre del último ejercicio").fill("2025-12-31");
  await page.getByLabel("Producto").selectOption("poliza_circulante");
  await page.getByLabel("Importe (€)").fill("100000");
  await page.getByLabel("Plazo (meses)").fill("12");
  const pill = page.getByRole("button", { name: "Contabilidad", exact: true });
  if ((await pill.getAttribute("aria-pressed")) !== "true") await pill.click();
  await page.getByRole("button", { name: "Crear caso" }).click();
  await expect(page.getByRole("heading", { name: /Caso creado/ })).toBeVisible();
  await page.goto("/casos");
  await page.getByRole("link", { name: company, exact: true }).click();
  await expect(page).toHaveURL(/\/casos\/[0-9a-f-]{36}$/);
  const caseUrl = page.url();

  // Close it: a reason is required.
  await page.getByRole("button", { name: "Cerrar caso" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cerrar caso" })).toBeDisabled();
  await expect(dialog).toContainText("se eliminan para siempre, con aviso 14 días antes");
  await dialog.getByLabel(/^Denegado/).check();
  await dialog.getByRole("button", { name: "Cerrar caso" }).click();

  const today = new Date();
  const inAYear = new Date(today);
  inAYear.setFullYear(today.getFullYear() + 1);
  const fmt = (d: Date) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(d);
  const status = page.getByRole("status").filter({ hasText: "Cerrado el" });
  await expect(status).toContainText(`Cerrado el ${fmt(today)} · Denegado.`);
  await expect(status).toContainText(`Se eliminará el ${fmt(inAYear)} (1 año desde el cierre, plazo de tu entidad); avisaremos 14 días antes.`);
  await expect(page.getByRole("button", { name: "Reabrir caso" })).toBeVisible();
  await page.screenshot({ path: "e2e/.files/closed-case.png", fullPage: false });

  // Only under «Cerrados».
  await page.goto("/casos");
  await expect(page.getByRole("link", { name: company, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: /^Cerrados/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: company })).toContainText("Cerrado");

  // The owner keeps closed cases for 2 years instead.
  await page.goto("/ajustes");
  await page.getByLabel("Conservar los casos cerrados").selectOption("24");
  await page.getByRole("region", { name: "Conservación de datos" }).getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await page.screenshot({ path: "e2e/.files/retention-settings.png", fullPage: true });
  await page.goto(caseUrl);
  const inTwoYears = new Date(today);
  inTwoYears.setFullYear(today.getFullYear() + 2);
  await expect(page.getByRole("status").filter({ hasText: "Cerrado el" })).toContainText(`Se eliminará el ${fmt(inTwoYears)} (2 años desde el cierre`);

  // Reopen: back to waiting for the company, and back in the main list.
  await page.getByRole("button", { name: "Reabrir caso" }).click();
  await expect(page.getByRole("button", { name: "Cerrar caso" })).toBeVisible();
  await expect(page.getByText("Esperando documentos").first()).toBeVisible();
  await page.goto("/casos");
  await expect(page.getByRole("link", { name: company, exact: true })).toBeVisible();
});
