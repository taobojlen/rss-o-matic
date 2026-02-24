import { defineVitestConfig } from "@nuxt/test-utils/config";

export default defineVitestConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globals: true,
    testTimeout: 30_000,
  },
});
