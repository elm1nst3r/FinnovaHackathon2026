import { defineConfig } from "vite";

// Tauri expects a fixed dev port and no screen clearing so cargo output stays visible.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    // Two pages: the companion (index.html) and the popup under the menu-bar dot.
    rollupOptions: {
      input: { main: "index.html", popup: "popup.html" },
    },
  },
});
