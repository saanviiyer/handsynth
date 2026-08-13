import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Client-only SPA. WASM assets for MediaPipe live in public/wasm (copied at
// install time by scripts/copy-wasm.mjs) and the model in public/models.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    target: "es2020",
  },
});
