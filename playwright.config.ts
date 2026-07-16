// =====================================================
// playwright.config.ts (project root)
// =====================================================
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/owner.json" },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 14"], storageState: "e2e/.auth/owner.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: process.env.CI
    ? { command: "npm run build && npm run start", port: 3000, reuseExistingServer: false }
    : undefined,
});
