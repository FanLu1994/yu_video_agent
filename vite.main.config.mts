import path from "node:path";
import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      // Keep ws optional native deps as runtime requires so ws can fall back to JS implementation.
      external: [
        "bufferutil",
        "utf-8-validate",
        "@remotion/bundler",
        "@remotion/renderer",
        "remotion",
      ],
    },
  },
});
