// e2e/billing.spec.ts — plan gates are enforced server-side
import { test, expect } from "@playwright/test";

test.describe("plan enforcement (FREE tenant)", () => {
  test.use({ storageState: "e2e/.auth/free-owner.json" });

  test("AI page is feature-locked on FREE", async ({ page }) => {
    await page.goto("/ai");
    await page.getByLabel(/message/i).fill("How much profit did I make?");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/isn't included in the Free plan/i)).toBeVisible();
  });

  test("billing page shows usage bars and plans", async ({ page }) => {
    await page.goto("/settings/billing");
    await expect(page.getByText(/free plan/i)).toBeVisible();
    await expect(page.getByRole("progressbar").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /choose pro/i })).toBeEnabled();
  });
});
