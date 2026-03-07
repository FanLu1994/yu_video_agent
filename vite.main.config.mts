import path from "node:path";
import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Speed up dependency pre-bundling
  optimizeDeps: {
    exclude: [
      "@remotion/bundler",
      "@remotion/renderer",
      "remotion",
      "electron",
    ],
  },
  build: {
    // Optimize build for faster rebuilds
    minify: false, // Skip minification in dev for faster builds
    target: "node18", // Don't transpile too much
    rollupOptions: {
      // Keep ws optional native deps as runtime requires so ws can fall back to JS implementation.
      external: [
        "bufferutil",
        "utf-8-validate",
        "@remotion/bundler",
        "@remotion/renderer",
        "remotion",
        "electron",
        "fsevents",
      ],
      // Improve treeshaking
      treeshake: {
        moduleSideEffects: false,
      },
    },
  },
  // Skip SSR-related processing
  ssr: {
    noExternal: true,
  },
});
