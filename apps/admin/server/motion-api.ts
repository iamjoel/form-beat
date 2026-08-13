import type { IncomingMessage, ServerResponse } from "node:http";
import type { MotionProject } from "../src/lib/editor-model.ts";
import { publishReadyMotions } from "./motion-publisher.ts";
import { MotionStore, type MotionStatus } from "./motion-store.ts";
import { createStarterMotionProject } from "./project-template.ts";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

type NextFunction = (error?: unknown) => void;

interface MotionApiOptions {
  databasePath: string;
  publishedModulePath?: string;
}

interface CreateMotionBody {
  name?: unknown;
  exerciseId?: unknown;
  durationMs?: unknown;
  project?: unknown;
  status?: unknown;
}

const EXERCISE_IDS = new Set(["squat", "push-up", "jumping-jack", "lunge"]);

function starterProjectFromBody(body: CreateMotionBody): MotionProject {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const exerciseId = typeof body.exerciseId === "string" ? body.exerciseId : "squat";
  const durationMs = Number(body.durationMs ?? 2_800);
  if (!name) throw new Error("动作名称不能为空");
  if (!EXERCISE_IDS.has(exerciseId)) throw new Error("不支持的健身动作类型");
  if (!Number.isFinite(durationMs) || durationMs < 300 || durationMs > 30_000) {
    throw new Error("动作时长必须在 300–30000 ms 之间");
  }
  return createStarterMotionProject({ name, exerciseId, durationMs: Math.round(durationMs) });
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(body);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new Error("请求数据超过 5 MB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求不是有效的 JSON");
  }
}

function parseStatus(value: unknown): MotionStatus | undefined {
  if (value === undefined) return undefined;
  if (value === "draft" || value === "ready") return value;
  throw new Error("状态必须是 draft 或 ready");
}

function parseProject(value: unknown): MotionProject {
  if (!value || typeof value !== "object") throw new Error("缺少动作项目数据");
  const project = value as Partial<MotionProject>;
  if (project.schemaVersion !== 1) throw new Error("不支持的项目版本");
  if (
    typeof project.name !== "string" ||
    typeof project.durationMs !== "number" ||
    project.durationMs < 300 ||
    project.durationMs > 30_000
  ) throw new Error("动作名称或时长无效");
  if (
    !project.reference ||
    typeof project.reference.exerciseId !== "string" ||
    !project.display ||
    !project.canvas ||
    !project.skeleton ||
    !Array.isArray(project.skeleton.connections)
  ) throw new Error("动作项目配置不完整");
  if (!Array.isArray(project.keyframes) || project.keyframes.length === 0) {
    throw new Error("项目中没有关键帧");
  }
  for (const frame of project.keyframes) {
    if (!frame || typeof frame.timeMs !== "number" || !Array.isArray(frame.points) || frame.points.length !== 33) {
      throw new Error("关键帧必须包含 33 个姿态点");
    }
  }
  if (!Array.isArray(project.annotations)) throw new Error("角度标注数据无效");
  return project as MotionProject;
}

export function createMotionApi({ databasePath, publishedModulePath }: MotionApiOptions) {
  const store = new MotionStore(databasePath);

  const middleware = (request: IncomingMessage, response: ServerResponse, next: NextFunction) => {
    const url = new URL(request.url ?? "/", "http://admin.local");
    if (!url.pathname.startsWith("/api/motions")) {
      next();
      return;
    }

    void (async () => {
      try {
        if (request.method === "GET" && url.pathname === "/api/motions") {
          sendJson(response, 200, { motions: store.list(url.searchParams.get("q") ?? "") });
          return;
        }

        if (request.method === "POST" && url.pathname === "/api/motions") {
          const body = await readJson(request) as CreateMotionBody;
          const project = body.project === undefined
            ? starterProjectFromBody(body)
            : parseProject(body.project);
          const motion = store.create(project, parseStatus(body.status) ?? "draft");
          sendJson(response, 201, { motion });
          return;
        }

        const publishMatch = url.pathname.match(/^\/api\/motions\/([^/]+)\/publish$/);
        if (publishMatch && request.method === "POST") {
          if (!publishedModulePath) throw new Error("未配置客户端动作发布路径");
          const id = decodeURIComponent(publishMatch[1]);
          const body = await readJson(request) as CreateMotionBody;
          const project = parseProject(body.project);
          const motion = store.update(id, project, "ready");
          if (!motion) {
            sendJson(response, 404, { error: "动作不存在" });
            return;
          }
          const publication = publishReadyMotions(store, publishedModulePath);
          sendJson(response, 200, { motion, publication });
          return;
        }

        const detailMatch = url.pathname.match(/^\/api\/motions\/([^/]+)$/);
        if (detailMatch) {
          const id = decodeURIComponent(detailMatch[1]);
          if (request.method === "GET") {
            const motion = store.get(id);
            sendJson(response, motion ? 200 : 404, motion ? { motion } : { error: "动作不存在" });
            return;
          }
          if (request.method === "PUT") {
            const body = await readJson(request) as CreateMotionBody;
            const project = parseProject(body.project);
            const status = parseStatus(body.status);
            const motion = store.update(id, project, status);
            if (status && publishedModulePath) {
              publishReadyMotions(store, publishedModulePath);
            }
            sendJson(response, motion ? 200 : 404, motion ? { motion } : { error: "动作不存在" });
            return;
          }
        }

        sendJson(response, 405, { error: "不支持的请求" });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "请求处理失败",
        });
      }
    })();
  };

  return { middleware, close: () => store.close(), store };
}
