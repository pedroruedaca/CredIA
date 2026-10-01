/** The account menu (avatar in the rail) closes on a click outside, on Esc and when moving to another page. */
import { expect, test } from "@playwright/test";

test("account menu closes on a click outside, Esc and navigation", async ({ page }) => {
  await page.goto("/casos");
  // The dev-only Next.js badge sits over the avatar in the bottom-left corner.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const avatar = page.getByRole("button", { name: /^Cuenta de / });
  const signOut = page.getByRole("button", { name: "Cerrar sesión" });

  await avatar.click();
  await expect(signOut).toBeVisible();
  await page.getByRole("heading", { name: "Casos", level: 1 }).click();
  await expect(signOut).toBeHidden();

  await avatar.click();
  await expect(signOut).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(signOut).toBeHidden();

  await avatar.click();
  await page.getByRole("link", { name: "Plantillas" }).click();
  await expect(page).toHaveURL(/\/plantillas$/);
  await expect(signOut).toBeHidden();
});
