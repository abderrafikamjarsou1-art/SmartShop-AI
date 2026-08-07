// e2e/auth.setup.ts — logs in once, saves storage state
import { test as setup, expect } from "@playwright/test";

setup("authenticate as owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.context().storageState({ path: "e2e/.auth/owner.json" });
});
