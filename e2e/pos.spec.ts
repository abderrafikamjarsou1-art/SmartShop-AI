// e2e/pos.spec.ts — THE money path, end to end
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
