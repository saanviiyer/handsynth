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
  // Bind to all interfaces so the dev server is reachable on hosted
  // environments (e.g. Replit) rather than only localhost.
  server: {
    host: true,
  },
  // The preview server backs `npm run preview` (the built app). Allow any
  // host so Vite does not return "Blocked request. This host is not allowed"
  // when served from *.replit.dev / *.replit.app / *.repl.co domains.
  preview: {
    host: true,
    allowedHosts: true,
  },
});
