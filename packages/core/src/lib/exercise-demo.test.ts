import { describe, expect, it } from "vitest";

import type { ExerciseId } from "../domain/exercises";
import {
  EXERCISE_DEMO_SPRITE_CROPS,
  getExerciseDemoCriticalMarkup,
  getExerciseDemoFrame,
  getExerciseDemoKeyframe,
  getExerciseDemoPoseAmount,
  POSE_CONNECTIONS,
} from "./exercise-demo";

const EXPECTED_ANGLE_VERTICES: Record<ExerciseId, readonly number[]> = {
  squat: [25],
  "push-up": [13, 23],
  "jumping-jack": [11, 12],
  lunge: [25, 26],
};

describe("exercise demo frames", () => {
  it.each(Object.entries(EXPECTED_ANGLE_VERTICES))(
    "uses the live angle overlays for %s",
    (exerciseId, expectedVertices) => {
      for (const progress of [0, 0.25, 0.5, 0.75]) {
        const frame = getExerciseDemoFrame(exerciseId as ExerciseId, progress);
        expect(frame.landmarks).toHaveLength(33);
        expect(frame.angleOverlays.map((overlay) => overlay.vertexIndex)).toEqual(
          expectedVertices,
        );
        expect(
          frame.angleOverlays.every((overlay) => Number.isFinite(overlay.degrees)),
        ).toBe(true);
      }
    },
  );

  it("shares the same complete pose connection map with renderers", () => {
    expect(POSE_CONNECTIONS).toHaveLength(20);
    expect(POSE_CONNECTIONS).toContainEqual([25, 27]);
    expect(POSE_CONNECTIONS).toContainEqual([14, 16]);
  });

  it("limits demo markup to the points and segments used by its angles", () => {
    const frame = getExerciseDemoFrame("push-up", 0.5);

    expect(getExerciseDemoCriticalMarkup(frame.angleOverlays)).toEqual({
      segments: [
        [11, 13],
        [13, 15],
        [11, 23],
        [23, 27],
      ],
      pointIndices: [11, 13, 15, 23, 27],
    });
  });

  it("provides synchronized sprite crops and keyframe timing", () => {
    expect(Object.keys(EXERCISE_DEMO_SPRITE_CROPS)).toEqual(
      Object.keys(EXPECTED_ANGLE_VERTICES),
    );
    expect(getExerciseDemoPoseAmount(0)).toBeCloseTo(0);
    expect(getExerciseDemoPoseAmount(0.5)).toBeCloseTo(1);
    expect(getExerciseDemoPoseAmount(1)).toBeCloseTo(0);
    expect(getExerciseDemoKeyframe(0)).toBe(0);
    expect(getExerciseDemoKeyframe(0.5)).toBe(1);
  });
});
