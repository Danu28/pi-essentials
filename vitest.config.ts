import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/state.ts", "src/tools.ts", "src/tool-helpers.ts", "src/index.ts"],
      exclude: ["src/**/*.test.ts", "src/pi-shim.d.ts"],
      thresholds: {
        lines: 45,
        functions: 40,
        branches: 35,
        statements: 45,
      },
    },
  },
});
