/**
 * Modular case view, phase 2: the team edits the case-view layout ("Personalizar"), the case page follows it, and
 * "Restaurar el diseño original para el equipo" brings the default back (left as found for the other tests).
 */
import { expect, test } from "@playwright/test";

test("personalise the case view for the team, then restore it", async ({ page }) => {
  // A case of its own (each run starts with a fresh lender).
  await page.goto("/casos/nuevo");
  await page.getByLabel("CIF").fill("B12345674");
  await page.getByLabel("Razón social").fill(`Paneles E2E ${Date.now()}, S.L.`);
  await page.getByLabel("Correo de la persona de contacto").fill("paneles@e2e.test");
  await page.getByLabel("Cierre del último ejercicio").fill("2025-12-31");
  await page.getByLabel("Producto").selectOption("poliza_circulante");
  await page.getByLabel("Importe (€)").fill("50000");
  await page.getByLabel("Plazo (meses)").fill("12");
  await page.getByRole("button", { name: "Contabilidad", exact: true }).click();
  await page.getByRole("button", { name: "Crear caso" }).click();
  await page.getByRole("link", { name: "Ir al caso" }).click();
  await expect(page).toHaveURL(/\/casos\/[0-9a-f-]{36}$/);
  const caseUrl = page.url();

  await page.getByRole("link", { name: "Personalizar el panel" }).click();
  await expect(page.getByRole("heading", { name: "Personalizar el panel del caso" })).toBeVisible();
  const tiles = page.getByRole("list", { name: "Módulos del panel, en orden" });

  // «Para revisar» cannot be removed; Fuentes can. Balance goes up one place and to half width.
  await expect(tiles.getByRole("button", { name: "Para revisar no se puede quitar" })).toBeDisabled();
  await tiles.getByRole("button", { name: "Quitar Fuentes" }).click();
  await expect(tiles).not.toContainText("Fuentes");
  await expect(page.getByRole("button", { name: "Añadir" })).toHaveCount(1); // Fuentes is back in the catalogue
  await tiles.getByRole("button", { name: "Subir Balance" }).click();
  await tiles.getByRole("button", { name: "Poner Balance a media anchura" }).click();
  // Keyboard drag: Indicadores one place down with the handle.
  await tiles.getByRole("button", { name: /^Mover Indicadores/ }).focus();
  for (const key of ["Space", "ArrowDown", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(300); // the drag library measures positions between frames
  }
  const order = await tiles.locator("li").evaluateAll((lis) => lis.map((li) => li.querySelector("span span")?.textContent));
  expect(order.slice(0, 4)).toEqual(["Resumen", "Para revisar", "Indicadores", "Balance"]);

  await page.getByRole("radio", { name: /Todo el equipo/ }).check();
  await page.getByRole("button", { name: "Guardar diseño" }).click();
  await expect(page).toHaveURL(caseUrl);
  await expect(page.locator('footer[aria-label="Fuentes"]')).toHaveCount(0);

  // Back to the original for the whole team.
  await page.getByRole("link", { name: "Personalizar el panel" }).click();
  await page.getByRole("button", { name: "Restaurar el diseño original para el equipo" }).click();
  await expect(page).toHaveURL(caseUrl);
  await expect(page.locator('footer[aria-label="Fuentes"]')).toBeVisible();
});
