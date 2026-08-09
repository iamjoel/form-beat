import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "./build/sites-vite-plugin.ts";

export default defineConfig({
  plugins: [react(), sites()],
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
  worker: {
    format: "es",
  },
  server: {
    host: "127.0.0.1",
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  },
});
