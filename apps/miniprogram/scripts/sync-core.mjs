import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");
const sourceRoot = resolve(repositoryRoot, "packages/core/dist");
const targetRoot = resolve(
  repositoryRoot,
  "apps/miniprogram/miniprogram/shared/core",
);

const modules = [
  "domain/exercises",
  "domain/session",
  "lib/geometry",
  "lib/rep-counter",
];

for (const modulePath of modules) {
  const targetDirectory = dirname(resolve(targetRoot, modulePath));
  await mkdir(targetDirectory, { recursive: true });

  for (const extension of [".js", ".d.ts"]) {
    await copyFile(
      resolve(sourceRoot, `${modulePath}${extension}`),
      resolve(targetRoot, `${modulePath}${extension}`),
    );
  }
}

console.log(`Synced shared core to ${targetRoot}`);
