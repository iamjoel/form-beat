import type { MotionProject } from "./editor-model";

export type MotionStatus = "draft" | "ready";

export interface MotionSummary {
  id: string;
  name: string;
  exerciseId: string;
  durationMs: number;
  keyframeCount: number;
  status: MotionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMotion extends MotionSummary {
  project: MotionProject;
}

export interface MotionPublication {
  exerciseIds: string[];
  outputPath: string;
  changed: boolean;
}

interface ApiErrorBody {
  error?: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });
  const body = await response.json() as T & ApiErrorBody;
  if (!response.ok) throw new Error(body.error ?? `请求失败（${response.status}）`);
  return body;
}

export async function listMotions(search = ""): Promise<MotionSummary[]> {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
  const response = await requestJson<{ motions: MotionSummary[] }>(`/api/motions${query}`);
  return response.motions;
}

export async function getMotion(id: string): Promise<StoredMotion> {
  const response = await requestJson<{ motion: StoredMotion }>(
    `/api/motions/${encodeURIComponent(id)}`,
  );
  return response.motion;
}

export async function updateMotion(
  id: string,
  project: MotionProject,
  status?: MotionStatus,
): Promise<StoredMotion> {
  const response = await requestJson<{ motion: StoredMotion }>(
    `/api/motions/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify({ project, status }),
    },
  );
  return response.motion;
}

export async function publishMotion(
  id: string,
  project: MotionProject,
): Promise<{ motion: StoredMotion; publication: MotionPublication }> {
  return requestJson<{ motion: StoredMotion; publication: MotionPublication }>(
    `/api/motions/${encodeURIComponent(id)}/publish`,
    {
      method: "POST",
      body: JSON.stringify({ project }),
    },
  );
}
