import { describe, expect, it } from "vitest";

import type { ExerciseId } from "../domain/exercises";
import {
  EXERCISE_DEMO_SPRITE_CROPS,
  getExerciseDemoCriticalMarkup,
  getExerciseDemoFrame,
  getExerciseDemoKeyframe,
  getExerciseDemoPoseAmount,
  getExerciseDemoSpriteCenter,
  POSE_CONNECTIONS,
} from "./exercise-demo";
import {
  getExerciseDemoMotionFrame,
  getExerciseDemoProject,
} from "./exercise-demo-project";

const EXPECTED_ANGLE_VERTICES: Record<ExerciseId, readonly number[]> = {
  squat: [25],
  "push-up": [13, 23],
  "jumping-jack": [11, 12],
  lunge: [25, 26],
};

const EXPECTED_END_ANGLES: Record<ExerciseId, readonly number[]> = {
  squat: [90],
  "push-up": [90, 180],
  "jumping-jack": [150, 150],
  lunge: [90, 90],
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

  it.each(Object.entries(EXPECTED_END_ANGLES))(
    "shows the recommended end-position angles for %s",
    (exerciseId, expectedAngles) => {
      const frame = getExerciseDemoFrame(exerciseId as ExerciseId, 0.5);

      expect(frame.angleOverlays.map((overlay) => overlay.degrees)).toEqual(
        expectedAngles,
      );
    },
  );

  it("provides synchronized sprite crops and keyframe timing", () => {
    expect(Object.keys(EXERCISE_DEMO_SPRITE_CROPS)).toHaveLength(7);
    expect(Object.keys(EXERCISE_DEMO_SPRITE_CROPS)).toEqual(
      expect.arrayContaining(Object.keys(EXPECTED_ANGLE_VERTICES)),
    );
    for (const exerciseId of [
      "superman",
      "close-grip-push-up",
      "mountain-climber",
    ] as const) {
      expect(getExerciseDemoProject(exerciseId)).toEqual(
        expect.objectContaining({
          reference: expect.objectContaining({ exerciseId }),
          character: expect.objectContaining({
            assetId: "husky-exercise-sprites-v3",
          }),
        }),
      );
    }
    expect(getExerciseDemoPoseAmount(0)).toBeCloseTo(0);
    expect(getExerciseDemoPoseAmount(0.5)).toBeCloseTo(1);
    expect(getExerciseDemoPoseAmount(1)).toBeCloseTo(0);
    expect(getExerciseDemoKeyframe(0)).toBe(0);
    expect(getExerciseDemoKeyframe(0.5)).toBe(1);
  });

  it("provides a visual center for both frames of every husky action", () => {
    for (const exerciseId of Object.keys(EXERCISE_DEMO_SPRITE_CROPS)) {
      for (const referenceFrame of [0, 1] as const) {
        const center = getExerciseDemoSpriteCenter(
          exerciseId as keyof typeof EXERCISE_DEMO_SPRITE_CROPS,
          referenceFrame,
        );
        expect(center.x).toBeGreaterThan(0);
        expect(center.x).toBeLessThan(1);
        expect(center.y).toBeGreaterThan(0);
        expect(center.y).toBeLessThan(1);
      }
    }
  });

  it("evaluates client demos from continuous multi-keyframe projects", () => {
    const project = getExerciseDemoProject("squat");
    const start = getExerciseDemoMotionFrame("squat", 0);
    const between = getExerciseDemoMotionFrame("squat", project.durationMs / 4);
    const effort = getExerciseDemoMotionFrame("squat", project.durationMs / 2);

    expect(project.keyframes).toHaveLength(3);
    expect(between.landmarks[25].x).toBeGreaterThan(start.landmarks[25].x);
    expect(between.landmarks[25].x).toBeLessThan(effort.landmarks[25].x);
    expect(between.angleOverlays).toHaveLength(1);
    expect(between.referenceFrame).toBe(1);
  });
});
