import { access, readFile, readdir, stat } from "node:fs/promises";

const projectConfigUrl = new URL("../project.config.json", import.meta.url);
const appEntryUrl = new URL("../miniprogram/app.ts", import.meta.url);
const miniprogramRootUrl = new URL("../miniprogram/", import.meta.url);
const MAX_MAIN_PACKAGE_BYTES = 2 * 1024 * 1024;
const projectConfig = JSON.parse(await readFile(projectConfigUrl, "utf8"));
const compilerPlugins = projectConfig.setting?.useCompilerPlugins;

async function directorySize(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(async (entry) => {
    const entryUrl = new URL(
      `${encodeURIComponent(entry.name)}${entry.isDirectory() ? "/" : ""}`,
      directoryUrl,
    );
    return entry.isDirectory()
      ? directorySize(entryUrl)
      : (await stat(entryUrl)).size;
  }));
  return sizes.reduce((total, size) => total + size, 0);
}

if (!Array.isArray(compilerPlugins) || !compilerPlugins.includes("typescript")) {
  throw new Error(
    "project.config.json 必须启用 setting.useCompilerPlugins: [\"typescript\"]，否则微信开发者工具不会执行 .ts 页面脚本。",
  );
}

await access(appEntryUrl);
const mainPackageBytes = await directorySize(miniprogramRootUrl);
if (mainPackageBytes > MAX_MAIN_PACKAGE_BYTES) {
  throw new Error(
    `小程序主包 ${(mainPackageBytes / 1024 / 1024).toFixed(2)}MB，超过微信 2MB 限制。`,
  );
}

console.log(
  `WeChat TypeScript compiler plugin is enabled. Main package: ${(mainPackageBytes / 1024 / 1024).toFixed(2)}MB.`,
);
