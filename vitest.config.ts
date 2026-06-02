import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // No tocamos red ni BD desde tests — solo módulos puros.
    // Si en el futuro añadimos tests E2E que necesitan BD, los aislamos en
    // src/**/*.integration.test.ts con su propio config.
    testTimeout: 5_000,
  },
});
