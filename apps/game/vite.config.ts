import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
  },
  optimizeDeps: {
    // Workspace package is consumed straight from TS source — don't pre-bundle it.
    exclude: ["@pegboard/engine"],
  },
});
