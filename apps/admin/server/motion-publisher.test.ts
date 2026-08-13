import { describe, expect, it } from "vitest";
import { createStarterMotionProject } from "./project-template.ts";
import {
  createPublishedMotionsSource,
  selectLatestReadyMotions,
} from "./motion-publisher.ts";
import type { StoredMotion } from "./motion-store.ts";

function storedMotion(
  id: string,
  exerciseId: "squat" | "push-up",
  name: string,
): StoredMotion {
  const project = createStarterMotionProject({
    name,
    exerciseId,
    durationMs: 2_800,
  });
  return {
    id,
    name,
    exerciseId,
    durationMs: project.durationMs,
    keyframeCount: project.keyframes.length,
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    project,
  };
}

describe("motion publisher", () => {
  it("keeps the latest ready project for each exercise", () => {
    const selected = selectLatestReadyMotions([
      storedMotion("latest", "squat", "新深蹲"),
      storedMotion("older", "squat", "旧深蹲"),
      storedMotion("push", "push-up", "俯卧撑"),
    ]);
    expect(selected.squat?.name).toBe("新深蹲");
    expect(selected["push-up"]?.name).toBe("俯卧撑");
  });

  it("creates a typed source module consumed by core", () => {
    const source = createPublishedMotionsSource({
      squat: storedMotion("squat", "squat", "客户端深蹲").project,
    });
    expect(source).toContain("PUBLISHED_EXERCISE_MOTIONS");
    expect(source).toContain("客户端深蹲");
    expect(source).toContain('"keyframes"');
  });
});
