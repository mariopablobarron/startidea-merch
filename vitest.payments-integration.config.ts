import { defineConfig } from "vitest/config";
import base from "./vitest.config";

export default defineConfig({
  ...base,
  test: {
    environment: "node",
    include: ["integration/stripe-payments.test.ts", "integration/facturascripts.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ["integration/payment-db-guard.ts"],
  },
});
