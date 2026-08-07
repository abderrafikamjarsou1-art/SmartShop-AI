// e2e/rbac.spec.ts — a cashier sees a different app
import { test, expect } from "@playwright/test";

test.describe("RBAC (cashier session)", () => {
  test.use({ storageState: "e2e/.auth/cashier.json" });

  test("no reports in nav; direct URL is refused", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /reports/i })).toHaveCount(0);
    await page.goto("/reports");
    await expect(page.getByText(/permission|forbidden/i)).toBeVisible();
  });

  test("products are read-only", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("button", { name: /add product/i })).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0); // no bulk select
  });
});
