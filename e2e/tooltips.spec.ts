/** Icon buttons explain themselves with a designed tooltip: on hover after a short delay, on keyboard focus, gone on Esc. */
import { expect, test } from "@playwright/test";

test("rail items show a tooltip on hover and on keyboard focus", async ({ page }) => {
  await page.goto("/casos");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const link = page.getByRole("link", { name: "Plantillas" });
  const tip = page.getByRole("tooltip");

  await link.hover();
  await expect(tip).toContainText("Documentos y panel guardados por tipo de operación.");
  await expect(link).toHaveAttribute("aria-describedby", (await tip.getAttribute("id"))!);
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();

  await page.mouse.move(600, 600);
  await page.getByRole("link", { name: "Casos" }).first().focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tooltip")).toContainText("Bandeja");
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.env.TOOLTIP_SHOT ?? "test-results/tooltip.png" });
});
