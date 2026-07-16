import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    exclude: ["node_modules", "e2e", "tests/concurrency.test.ts"],
  },
  resolve: { alias: { "@": resolve(__dirname, "./src") } },
});
