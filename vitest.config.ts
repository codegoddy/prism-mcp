import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "node_modules/",
        "build/",
        "test/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.config.ts"
      ]
    },
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    exclude: ["node_modules", "build"],
    setupFiles: ["test/setup.ts"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
