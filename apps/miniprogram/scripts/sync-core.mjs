import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");
const sourceRoot = resolve(repositoryRoot, "packages/core/dist");
const targetRoot = resolve(
  repositoryRoot,
  "apps/miniprogram/miniprogram/shared/core",
);
const assetNames = [
  "husky-exercise-sprites-v2.jpg",
  "husky-exercise-sprites-v3.jpg",
];
const obsoleteAssetNames = [
  "husky-exercise-sprites-v2.png",
  "husky-exercise-sprites-v3.png",
];

const modules = [
  "domain/exercise-catalog",
  "domain/exercises",
  "domain/session",
  "generated/published-exercise-motions",
  "lib/exercise-demo",
  "lib/exercise-demo-project",
  "lib/geometry",
  "lib/motion-project",
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

for (const assetName of assetNames) {
  const sourceAsset = resolve(repositoryRoot, "packages/core/assets", assetName);
  const targetAsset = resolve(
    repositoryRoot,
    "apps/miniprogram/miniprogram/assets/generated",
    assetName,
  );
  await mkdir(dirname(targetAsset), { recursive: true });
  await copyFile(sourceAsset, targetAsset);
}

for (const assetName of obsoleteAssetNames) {
  await rm(
    resolve(
      repositoryRoot,
      "apps/miniprogram/miniprogram/assets/generated",
      assetName,
    ),
    { force: true },
  );
}

console.log(`Synced shared core to ${targetRoot}`);
