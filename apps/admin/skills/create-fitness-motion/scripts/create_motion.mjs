#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const SUPPORTED_EXERCISES = new Set(["squat", "push-up", "jumping-jack", "lunge"]);

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run" || argument === "--help") {
      values[argument.slice(2)] = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`未知参数：${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} 缺少值`);
    values[argument.slice(2)] = value;
    index += 1;
  }
  return values;
}

function printHelp() {
  console.log(`Create a Form Beat fitness motion record.

Usage:
  node scripts/create_motion.mjs --name <name> [options]
  node scripts/create_motion.mjs --project <absolute-json-path> [options]

Options:
  --name <text>          Starter motion name
  --exercise <id>        squat | push-up | jumping-jack | lunge
  --duration <ms>        300–30000, default 2800
  --project <path>       Import a complete Motion Lab JSON project
  --status <value>       draft | ready, default draft
  --base-url <url>       Default http://localhost:5174
  --dry-run              Validate and print the request only
  --help                 Show this help`);
}

async function createBody(options) {
  const status = options.status ?? "draft";
  if (status !== "draft" && status !== "ready") throw new Error("--status 必须是 draft 或 ready");

  if (options.project) {
    const project = JSON.parse(await readFile(options.project, "utf8"));
    return { project, status };
  }

  const name = String(options.name ?? "").trim();
  const exerciseId = options.exercise ?? "squat";
  const durationMs = Number(options.duration ?? 2_800);
  if (!name) throw new Error("请提供 --name");
  if (!SUPPORTED_EXERCISES.has(exerciseId)) {
    throw new Error(`不支持的 --exercise：${exerciseId}`);
  }
  if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > 30_000) {
    throw new Error("--duration 必须在 300–30000 之间");
  }
  return { name, exerciseId, durationMs: Math.round(durationMs), status };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const body = await createBody(options);
  const baseUrl = String(options["base-url"] ?? "http://localhost:5174").replace(/\/+$/, "");
  if (options["dry-run"]) {
    console.log(JSON.stringify({ url: `${baseUrl}/api/motions`, body }, null, 2));
    return;
  }

  const response = await fetch(`${baseUrl}/api/motions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? `Admin API 返回 ${response.status}`);

  const motion = result.motion;
  console.log(JSON.stringify({
    motionId: motion.id,
    name: motion.name,
    exerciseId: motion.exerciseId,
    status: motion.status,
    editorUrl: `${baseUrl}/editor/${encodeURIComponent(motion.id)}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
