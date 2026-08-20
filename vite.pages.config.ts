import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/Exoplanet-Visualizer/",
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: "dist-pages",
    rollupOptions: {
      input: resolve(process.cwd(), "index.html"),
    },
  },
});
