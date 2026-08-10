import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { sites } from "./build/sites-vite-plugin.ts";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  plugins: [react(), sites({ projectRoot })],
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("../../dist/client", import.meta.url)),
  },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
  worker: {
    format: "es",
  },
  server: {
    host: "0.0.0.0",
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
