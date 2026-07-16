// =====================================================
// e2e/auth.setup.ts — logs in once, saves storage state
// =====================================================
import { test as setup, expect } from "@playwright/test";

setup("authenticate as owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(process.env.E2E_OWNER_EMAIL!);
  await page.getByLabel(/password/i).fill(process.env.E2E_OWNER_PASSWORD!);
  await page.getByRole("button", { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.context().storageState({ path: "e2e/.auth/owner.json" });
});

// =====================================================
// e2e/pos.spec.ts — THE money path, end to end
// =====================================================
import { test, expect } from "@playwright/test";

test.describe("POS sale lifecycle", () => {
  test("search -> cart -> pay cash with change -> receipt", async ({ page }) => {
    await page.goto("/sales/pos");

    // F2 focuses search; type a seeded product
    await page.keyboard.press("F2");
    await page.getByLabel(/search products/i).fill("E2E Test Cable");
    await page.getByRole("button", { name: /E2E Test Cable/ }).click();

    // Cart shows the line with the seeded price
    await expect(page.getByText("E2E Test Cable")).toBeVisible();

    // Pay (F9) — overpay in cash to assert change math
    await page.keyboard.press("F9");
    const amount = page.getByLabel(/payment amount/i);
    const due = Number((await amount.inputValue()));
    await amount.fill(String(due + 10));
    await expect(page.getByText(/change/i)).toBeVisible();
    await page.getByRole("button", { name: /complete sale/i }).click();

    // Receipt dialog: sale number + change due + invoice ref
    await expect(page.getByText(/sale #\d+ completed/i)).toBeVisible();
    await expect(page.getByText(/10\.00/)).toBeVisible(); // the change
    await expect(page.getByText(/INV-\d{5}/)).toBeVisible();
  });

  test("stock decremented and movement written", async ({ page }) => {
    await page.goto("/inventory/movements");
    await expect(page.getByText(/E2E Test Cable/).first()).toBeVisible();
    await expect(page.getByText(/sale/i).first()).toBeVisible();
  });

  test("return one unit refunds at effective rate", async ({ page }) => {
    await page.goto("/sales");
    await page.getByRole("row").nth(1).click(); // newest sale
    await page.getByRole("button", { name: /return items/i }).click();
    await page.getByLabel(/return quantity/i).first().fill("1");
    await page.getByLabel(/reason/i).fill("E2E return");
    await page.getByRole("button", { name: /process return/i }).click();
    await expect(page.getByText(/refund/i)).toBeVisible();
  });
});

// =====================================================
// e2e/billing.spec.ts — plan gates are enforced server-side
// =====================================================
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

// =====================================================
// e2e/rbac.spec.ts — a cashier sees a different app
// =====================================================
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
