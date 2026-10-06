/**
 * Process templates end to end: create a template (documents + its own dashboard), start a case from it (documents
 * pre-filled and still editable), the case shows the template's dashboard, a case-only layout, and back to the
 * template's.
 */
import { expect, test } from "@playwright/test";

test("template: documents and dashboard pre-set a new case, which can still change them", async ({ page }) => {
  const name = `Factoring E2E ${Date.now()}`;
  const footer = page.locator('footer[aria-label="Fuentes"]');

  // 1. The template: factoring, accounting from the company, CIRBE uploaded by the analyst.
  await page.goto("/plantillas");
  await page.getByRole("link", { name: "Nueva plantilla" }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Producto (opcional)").selectOption("factoring");
  await page.getByRole("button", { name: "Contabilidad", exact: true }).click();
  await page.getByRole("button", { name: "Informe CIRBE", exact: true }).click();
  await page.getByRole("group", { name: /^Informe CIRBE:/ }).getByRole("button", { name: "Lo subo yo" }).click();
  // Default cost of sales for the adjusted gross margin: «Servicios», plus Seguridad Social made explicit.
  await page.getByRole("group", { name: "Coste de ventas por defecto" }).getByRole("button", { name: "Servicios", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /^642/ })).toBeDisabled(); // inside «Gastos de personal», already ticked
  // 2. A personalised panel: creating the template opens the designer straight away. Without «Fuentes».
  await expect(page.getByRole("button", { name: "Crear plantilla", exact: true })).toBeVisible();
  await page.getByText("Panel personalizado").click();
  await page.getByRole("button", { name: "Crear plantilla y diseñar el panel" }).click();
  await expect(page.getByRole("heading", { name: "Panel del caso de esta plantilla" })).toBeVisible();
  await page.getByRole("list", { name: "Módulos del panel, en orden" }).getByRole("button", { name: "Quitar Fuentes" }).click();
  await page.getByRole("button", { name: "Guardar diseño" }).click();
  await expect(page.getByText("Diseño propio")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Panel personalizado/ })).toBeChecked();

  // 3. A case from it: product and documents pre-filled; the analyst adds Norma 43.
  await page.getByRole("link", { name: "Crear caso con esta plantilla" }).click();
  await expect(page.getByLabel("Plantilla", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await expect(page.getByLabel("Producto", { exact: true })).toHaveValue("factoring");
  await expect(page.getByRole("button", { name: "Contabilidad", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: /^Informe CIRBE:/ }).getByRole("button", { name: "Lo subo yo" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Extractos bancarios (Norma 43)", exact: true }).click();
  await page.getByLabel("CIF").fill("B12345674");
  await page.getByLabel("Razón social").fill(`Plantilla E2E ${Date.now()}, S.L.`);
  await page.getByLabel("Correo de la persona de contacto").fill("plantilla@e2e.test");
  await page.getByLabel("Cierre del último ejercicio").fill("2025-12-31");
  await page.getByLabel("Importe (€)").fill("80000");
  await page.getByLabel("Plazo (meses)").fill("6");
  await page.getByRole("button", { name: "Crear caso" }).click();
  await page.getByRole("link", { name: "Ir al caso" }).click();
  await expect(page).toHaveURL(/\/casos\/[0-9a-f-]{36}$/);
  const caseUrl = page.url();

  // 4. The case shows the template's dashboard, and the analyst's CIRBE.
  await expect(page.getByRole("region", { name: "Documentos que subes tú" })).toContainText("Informe CIRBE");
  await expect(footer).toHaveCount(0);

  // 5. A layout for this case only (the default choice), then back to the template's.
  await page.getByRole("link", { name: "Personalizar el panel" }).click();
  await expect(page.getByText(`Ahora ves el diseño de la plantilla «${name}».`, { exact: false })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Solo este caso/ })).toBeChecked();
  await page.getByRole("button", { name: "Añadir", exact: true }).click(); // Fuentes is the only module outside the layout («Indicadores» offers «Añadir otro»)
  await page.getByRole("button", { name: "Guardar diseño" }).click();
  await expect(page).toHaveURL(caseUrl);
  await expect(footer).toBeVisible();

  await page.getByRole("link", { name: "Personalizar el panel" }).click();
  await page.getByRole("button", { name: "Volver al diseño de la plantilla" }).click();
  await expect(page).toHaveURL(caseUrl);
  await expect(footer).toHaveCount(0);

  // 6. The case got a copy of the template's cost of sales.
  await page.goto(`${caseUrl}/coste-de-ventas`);
  await expect(page.getByText(/Criterio de la plantilla: Servicios/)).toBeVisible();
});
