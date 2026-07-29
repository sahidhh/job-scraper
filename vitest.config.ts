import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig sets `jsx: "preserve"` for Next's own compiler, which leaves
  // esbuild on the classic transform and breaks JSX in test files. Component
  // tests need the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Node stays the default so the ~1000 domain/application tests keep their
    // current speed. Component tests opt in per file with a
    // `// @vitest-environment jsdom` docblock rather than paying jsdom
    // startup everywhere.
    environment: "node",
    // Needed for @testing-library/react's automatic between-test cleanup,
    // which only registers itself when a global afterEach exists.
    globals: true,
    exclude: ["**/node_modules/**", "**/.claude/**"],
  },
});
