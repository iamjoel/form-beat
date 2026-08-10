import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: "worker/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    minify: true,
    outDir: fileURLToPath(new URL("../../dist/server", import.meta.url)),
    target: "es2022",
  },
});
