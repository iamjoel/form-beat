import { access, readFile } from "node:fs/promises";

const projectConfigUrl = new URL("../project.config.json", import.meta.url);
const appEntryUrl = new URL("../miniprogram/app.ts", import.meta.url);
const projectConfig = JSON.parse(await readFile(projectConfigUrl, "utf8"));
const compilerPlugins = projectConfig.setting?.useCompilerPlugins;

if (!Array.isArray(compilerPlugins) || !compilerPlugins.includes("typescript")) {
  throw new Error(
    "project.config.json 必须启用 setting.useCompilerPlugins: [\"typescript\"]，否则微信开发者工具不会执行 .ts 页面脚本。",
  );
}

await access(appEntryUrl);
console.log("WeChat TypeScript compiler plugin is enabled.");
