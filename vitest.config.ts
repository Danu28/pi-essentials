import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/state.ts", "src/tools.ts"],
      exclude: ["src/**/*.test.ts", "src/pi-shim.d.ts"],
      thresholds: {
        lines: 15,
        functions: 25,
        branches: 12,
        statements: 15,
      },
    },
  },
});
