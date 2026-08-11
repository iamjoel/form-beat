import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MotionStore } from "./motion-store.ts";
import { createStarterMotionProject } from "./project-template.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite motion store", () => {
  it("builds distinct starter poses and annotations for every exercise", () => {
    const squat = createStarterMotionProject({ name: "深蹲", exerciseId: "squat", durationMs: 2_800 });
    const pushUp = createStarterMotionProject({ name: "俯卧撑", exerciseId: "push-up", durationMs: 2_800 });
    const jumpingJack = createStarterMotionProject({ name: "开合跳", exerciseId: "jumping-jack", durationMs: 2_800 });
    const lunge = createStarterMotionProject({ name: "弓步蹲", exerciseId: "lunge", durationMs: 2_800 });

    expect(pushUp.keyframes[0].points[0]).not.toEqual(squat.keyframes[0].points[0]);
    expect(jumpingJack.keyframes[1].points[15].x).toBe(0.15);
    expect(lunge.keyframes[1].points[27].x).toBe(0.143);
    expect(pushUp.annotations.map((annotation) => annotation.label)).toEqual(["左肘角", "身体直线"]);
  });

  it("creates, lists, reads and updates a fitness motion", () => {
    const store = new MotionStore(":memory:");
    const project = createStarterMotionProject({
      name: "深蹲节奏 A",
      exerciseId: "squat",
      durationMs: 3_200,
    });

    const created = store.create(project);
    expect(created.project.keyframes).toHaveLength(3);
    expect(store.list("深蹲")).toEqual([
      expect.objectContaining({ id: created.id, durationMs: 3_200, keyframeCount: 3 }),
    ]);

    const updated = store.update(
      created.id,
      { ...created.project, name: "深蹲节奏 B" },
      "ready",
    );
    expect(updated).toEqual(expect.objectContaining({ name: "深蹲节奏 B", status: "ready" }));
    expect(store.get(created.id)?.project.name).toBe("深蹲节奏 B");
    store.close();
  });

  it("persists complete projects after the database is reopened", () => {
    const directory = mkdtempSync(join(tmpdir(), "form-beat-admin-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "motions.sqlite");
    const project = createStarterMotionProject({
      name: "弓步持久化测试",
      exerciseId: "lunge",
      durationMs: 2_400,
    });

    const firstStore = new MotionStore(databasePath);
    const id = firstStore.create(project).id;
    firstStore.close();

    const reopenedStore = new MotionStore(databasePath);
    expect(reopenedStore.get(id)).toEqual(expect.objectContaining({
      name: "弓步持久化测试",
      exerciseId: "lunge",
      project: expect.objectContaining({ durationMs: 2_400 }),
    }));
    reopenedStore.close();
  });
});
