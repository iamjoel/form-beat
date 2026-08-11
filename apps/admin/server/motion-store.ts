import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MotionProject } from "../src/lib/editor-model.ts";

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

interface MotionRow {
  id: string;
  name: string;
  exercise_id: string;
  duration_ms: number;
  keyframe_count: number;
  status: MotionStatus;
  project_json: string;
  created_at: string;
  updated_at: string;
}

function asMotionRow(value: unknown): MotionRow | undefined {
  return value as MotionRow | undefined;
}

function toSummary(row: MotionRow): MotionSummary {
  return {
    id: row.id,
    name: row.name,
    exerciseId: row.exercise_id,
    durationMs: row.duration_ms,
    keyframeCount: row.keyframe_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function metadata(project: MotionProject) {
  return {
    name: project.name.trim() || "未命名动作",
    exerciseId: project.reference.exerciseId,
    durationMs: Math.round(project.durationMs),
    keyframeCount: project.keyframes.length,
  };
}

export class MotionStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS motions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        keyframe_count INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
        project_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS motions_updated_at_idx ON motions(updated_at DESC);
    `);
  }

  list(search = ""): MotionSummary[] {
    const normalizedSearch = search.trim();
    const rows = normalizedSearch
      ? this.database.prepare(`
          SELECT * FROM motions
          WHERE name LIKE ? OR exercise_id LIKE ?
          ORDER BY updated_at DESC, created_at DESC
        `).all(`%${normalizedSearch}%`, `%${normalizedSearch}%`)
      : this.database.prepare(`
          SELECT * FROM motions
          ORDER BY updated_at DESC, created_at DESC
        `).all();
    return rows.map((row) => toSummary(asMotionRow(row)!));
  }

  get(id: string): StoredMotion | null {
    const row = asMotionRow(
      this.database.prepare("SELECT * FROM motions WHERE id = ?").get(id),
    );
    if (!row) return null;
    return {
      ...toSummary(row),
      project: JSON.parse(row.project_json) as MotionProject,
    };
  }

  create(project: MotionProject, status: MotionStatus = "draft"): StoredMotion {
    const id = `motion_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();
    const details = metadata(project);
    this.database.prepare(`
      INSERT INTO motions (
        id, name, exercise_id, duration_ms, keyframe_count, status,
        project_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      details.name,
      details.exerciseId,
      details.durationMs,
      details.keyframeCount,
      status,
      JSON.stringify(project),
      timestamp,
      timestamp,
    );
    return this.get(id)!;
  }

  update(id: string, project: MotionProject, status?: MotionStatus): StoredMotion | null {
    const current = this.get(id);
    if (!current) return null;
    const details = metadata(project);
    const updatedAt = new Date().toISOString();
    this.database.prepare(`
      UPDATE motions
      SET name = ?, exercise_id = ?, duration_ms = ?, keyframe_count = ?,
          status = ?, project_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      details.name,
      details.exerciseId,
      details.durationMs,
      details.keyframeCount,
      status ?? current.status,
      JSON.stringify(project),
      updatedAt,
      id,
    );
    return this.get(id);
  }

  close(): void {
    this.database.close();
  }
}
