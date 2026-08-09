import { defineConfig } from "vite";

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
    outDir: "dist/server",
    target: "es2022",
  },
});
