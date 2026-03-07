import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    tailwindcss(),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ],
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Optimize dependency pre-bundling for faster startup
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "@tanstack/react-router",
      "i18next",
      "react-i18next",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "lucide-react",
    ],
    // Exclude heavy packages that are not used in renderer
    exclude: [
      "@remotion/bundler",
      "@remotion/renderer",
      "remotion",
      "electron",
    ],
  },
  // Skip SSR-related processing
  ssr: {
    noExternal: true,
  },
});
