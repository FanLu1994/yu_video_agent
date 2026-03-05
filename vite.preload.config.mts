import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    minify: false, // Skip minification in dev for faster builds
    target: "node18",
  },
});
