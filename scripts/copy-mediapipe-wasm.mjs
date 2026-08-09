import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const entry = require.resolve("@mediapipe/tasks-vision/vision_wasm_internal.js");
const source = dirname(entry);
const destination = resolve("public/wasm");

if (!existsSync(destination)) mkdirSync(destination, { recursive: true });

for (const file of readdirSync(source)) {
  if (!file.startsWith("vision_wasm")) continue;
  cpSync(resolve(source, file), resolve(destination, file));
}

console.log("MediaPipe WASM assets prepared in public/wasm.");

