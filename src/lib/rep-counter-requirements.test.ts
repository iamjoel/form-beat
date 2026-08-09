import { describe, expect, it } from "vitest";
import type { ExerciseId } from "../domain/exercises";
import type { PosePoint } from "./geometry";
import {
  classifyPose,
  createRepCounterState,
  updateRepCounter,
  type PoseFrame,
} from "./rep-counter";

function makeLandmarks(visibility = 0.1): PosePoint[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility,
  }));
}

function frame(landmarks: PosePoint[]): PoseFrame {
  return {
    landmarks,
    size: { width: 720, height: 1_280 },
    timestamp: 0,
  };
}

const REQUIRED_LANDMARKS: readonly [ExerciseId, readonly number[]][] = [
  ["squat", [11, 23, 25, 27]],
  ["push-up", [11, 13, 15, 23, 27]],
  ["jumping-jack", [11, 12, 15, 16, 23, 24, 27, 28]],
  ["lunge", [23, 24, 25, 26, 27, 28]],
];

describe("exercise-specific tracking requirements", () => {
  it.each(REQUIRED_LANDMARKS)(
    "%s ignores body parts that are not needed for the exercise",
    (exerciseId, requiredIndices) => {
      const points = makeLandmarks();
      for (const index of requiredIndices) {
        points[index] = { ...points[index], visibility: 0.95 };
      }

      const update = updateRepCounter(
        exerciseId,
        createRepCounterState(),
        frame(points),
      );

      expect(update.requirementsMet).toBe(true);
    },
  );

  it.each(REQUIRED_LANDMARKS)(
    "%s requires every tracked body part to remain inside the visible frame",
    (exerciseId, requiredIndices) => {
      const points = makeLandmarks();
      for (const index of requiredIndices) {
        points[index] = { ...points[index], visibility: 0.95 };
      }
      points[requiredIndices[0]] = {
        ...points[requiredIndices[0]],
        x: -0.01,
      };

      const result = classifyPose(exerciseId, frame(points));

      expect(result.valid).toBe(false);
      expect(result.angleOverlays).toEqual([]);
    },
  );

  it("chooses a fully visible side over a higher-scoring cropped side", () => {
    const points = makeLandmarks();
    const left = [11, 13, 15, 23, 27];
    for (const index of left) {
      points[index] = { ...points[index], visibility: 0.99 };
    }
    points[15] = { ...points[15], x: 1.01 };

    points[12] = { x: 0.2, y: 0.5, visibility: 0.75 };
    points[14] = { x: 0.4, y: 0.5, visibility: 0.75 };
    points[16] = { x: 0.4, y: 0.7, visibility: 0.75 };
    points[24] = { x: 0.6, y: 0.5, visibility: 0.75 };
    points[28] = { x: 0.9, y: 0.5, visibility: 0.75 };

    const result = classifyPose("push-up", frame(points));

    expect(result.valid).toBe(true);
    expect(result.angleOverlays.map((overlay) => overlay.id)).toEqual([
      "right-elbow",
      "right-body-line",
    ]);
  });

  it("uses the actual visible crop of a cover preview", () => {
    const points = makeLandmarks(0.95);
    points[15] = { ...points[15], x: 0.08 };
    const croppedFrame: PoseFrame = {
      ...frame(points),
      visibleBounds: { minX: 0.1, maxX: 0.9, minY: 0, maxY: 1 },
    };

    expect(classifyPose("jumping-jack", croppedFrame).valid).toBe(false);
  });
});
