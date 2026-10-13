import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static build into ../docs so GitHub Pages serves Guard at the site root.
// The old verdict board stays at docs/board.html and docs/board-data.json is left alone.
export default defineConfig({
  base: "./",
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "../docs",
    emptyOutDir: false,
    assetsDir: "assets",
    chunkSizeWarningLimit: 4000,
    target: "es2022",
    // index.html: Privy, Dynamic and Mera. mera.html: Mera is the whole account layer.
    rollupOptions: { input: { index: "index.html", mera: "mera.html" } },
  },
});
