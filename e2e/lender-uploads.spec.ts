/**
 * «Lo subo yo» end to end: a case where the analyst provides every document. The company is not invited, the case
 * shows «Te toca subir» and appears under «Requieren tu atención»; once the analyst uploads it, the pill goes and the
 * case moves on as if submitted.
 */
import { expect, test } from "@playwright/test";

test("analyst-only case: no invitation, «Te toca subir», filter, and the case moves on after the upload", async ({ page }) => {
  const company = `Servicios Analista E2E ${Date.now()}, S.L.`;
  await page.goto("/casos/nuevo");
  await page.getByLabel("CIF").fill("B12345674");
  await page.getByLabel("Razón social").fill(company);
  await page.getByLabel("Correo de la persona de contacto").fill("analista@e2e.test");
  await page.getByLabel("Cierre del último ejercicio").fill("2025-12-31");
  await page.getByLabel("Producto").selectOption("poliza_circulante");
  await page.getByLabel("Importe (€)").fill("100000");
  await page.getByLabel("Plazo (meses)").fill("12");
  await page.getByRole("button", { name: "Informe CIRBE", exact: true }).click();
  await page.getByRole("group", { name: /^Informe CIRBE:/ }).getByRole("button", { name: "Lo subo yo" }).click();
  await page.getByRole("button", { name: "Crear caso" }).click();

  await expect(page.getByText("Sin invitación")).toBeVisible();
  await expect(page.getByLabel("Enlace para la empresa")).toHaveCount(0);

  // The list: «Te toca subir · 1», and the case is under «Requieren tu atención», not «Esperando a la empresa».
  await page.goto("/casos?filtro=atencion");
  const row = page.getByRole("listitem").filter({ hasText: company });
  await expect(row).toContainText("Te toca subir · 1");
  await page.goto("/casos?filtro=empresa");
  await expect(page.getByRole("listitem").filter({ hasText: company })).toHaveCount(0);

  // The analyst uploads the CIRBE from the case view.
  await page.goto("/casos?filtro=atencion");
  await page.getByRole("link", { name: company, exact: true }).click();
  await expect(page).toHaveURL(/\/casos\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Te toca subir · 1")).toBeVisible();
  const section = page.getByRole("region", { name: "Documentos que subes tú" });
  await section.locator('input[type="file"]').setInputFiles("e2e/.files/cirbe.pdf");
  await expect(section).toContainText("cirbe.pdf", { timeout: 60_000 });

  // Nothing left for anyone to upload: the pill goes and the case leaves «Esperando documentos».
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Te toca subir")).toHaveCount(0, { timeout: 2_000 });
    await expect(page.getByText("Esperando documentos")).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 90_000 });
});
