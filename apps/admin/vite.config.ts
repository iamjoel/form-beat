import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createMotionApi } from "./server/motion-api.ts";

const databasePath = process.env.FORM_BEAT_ADMIN_DB_PATH
  ?? fileURLToPath(new URL("./data/motions.sqlite", import.meta.url));

function motionApiPlugin() {
  return {
    name: "form-beat-motion-api",
    configureServer(server: { middlewares: { use: (handler: unknown) => void }; httpServer: { once: (event: string, callback: () => void) => void } | null }) {
      const api = createMotionApi({ databasePath });
      server.middlewares.use(api.middleware);
      server.httpServer?.once("close", api.close);
    },
    configurePreviewServer(server: { middlewares: { use: (handler: unknown) => void }; httpServer: { once: (event: string, callback: () => void) => void } | null }) {
      const api = createMotionApi({ databasePath });
      server.middlewares.use(api.middleware);
      server.httpServer?.once("close", api.close);
    },
  };
}

export default defineConfig({
  plugins: [react(), motionApiPlugin()],
  build: {
    emptyOutDir: true,
    outDir: fileURLToPath(new URL("../../dist/admin", import.meta.url)),
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
  },
});
