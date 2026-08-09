import { describe, expect, it } from "vitest";
import type { PosePoint } from "./geometry";
import { classifyPose, type PoseFrame } from "./rep-counter";

function landmarks(): PosePoint[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0.95,
  }));
}

function frame(points: PosePoint[]): PoseFrame {
  return {
    landmarks: points,
    size: { width: 100, height: 100 },
    timestamp: 0,
  };
}

describe("pose angle overlays", () => {
  it("uses the same selected knee angle as the squat metric", () => {
    const points = landmarks();
    points[11] = { x: 0.3, y: 0.1, visibility: 0.99 };
    points[23] = { x: 0.3, y: 0.4, visibility: 0.99 };
    points[25] = { x: 0.3, y: 0.7, visibility: 0.99 };
    points[27] = { x: 0.6, y: 0.7, visibility: 0.99 };

    const result = classifyPose("squat", frame(points));

    expect(result.metric).toBe(90);
    expect(result.angleOverlays).toEqual([
      {
        id: "left-knee",
        startIndex: 23,
        vertexIndex: 25,
        endIndex: 27,
        degrees: 90,
      },
    ]);
  });

  it("marks the elbow and body line used to classify a push-up", () => {
    const points = landmarks();
    points[11] = { x: 0.2, y: 0.5, visibility: 0.99 };
    points[13] = { x: 0.4, y: 0.5, visibility: 0.99 };
    points[15] = { x: 0.4, y: 0.7, visibility: 0.99 };
    points[23] = { x: 0.6, y: 0.5, visibility: 0.99 };
    points[25] = { x: 0.75, y: 0.5, visibility: 0.99 };
    points[27] = { x: 0.9, y: 0.5, visibility: 0.99 };

    const result = classifyPose("push-up", frame(points));

    expect(result.angleOverlays.map(({ id, degrees }) => ({ id, degrees }))).toEqual([
      { id: "left-elbow", degrees: 90 },
      { id: "left-body-line", degrees: 180 },
    ]);
  });

  it("marks both shoulder angles for jumping jacks", () => {
    const points = landmarks();
    points[23] = { x: 0.35, y: 0.65, visibility: 0.99 };
    points[11] = { x: 0.35, y: 0.4, visibility: 0.99 };
    points[15] = { x: 0.15, y: 0.4, visibility: 0.99 };
    points[24] = { x: 0.65, y: 0.65, visibility: 0.99 };
    points[12] = { x: 0.65, y: 0.4, visibility: 0.99 };
    points[16] = { x: 0.85, y: 0.4, visibility: 0.99 };
    points[27] = { x: 0.35, y: 0.9, visibility: 0.99 };
    points[28] = { x: 0.65, y: 0.9, visibility: 0.99 };

    const result = classifyPose("jumping-jack", frame(points));

    expect(result.angleOverlays.map(({ vertexIndex, degrees }) => ({ vertexIndex, degrees })))
      .toEqual([
        { vertexIndex: 11, degrees: 90 },
        { vertexIndex: 12, degrees: 90 },
      ]);
  });

  it("marks both knee angles for lunges and hides angles when the pose is lost", () => {
    const points = landmarks();
    points[23] = { x: 0.35, y: 0.3, visibility: 0.99 };
    points[25] = { x: 0.35, y: 0.6, visibility: 0.99 };
    points[27] = { x: 0.6, y: 0.6, visibility: 0.99 };
    points[24] = { x: 0.65, y: 0.3, visibility: 0.99 };
    points[26] = { x: 0.65, y: 0.6, visibility: 0.99 };
    points[28] = { x: 0.65, y: 0.9, visibility: 0.99 };

    const result = classifyPose("lunge", frame(points));
    expect(result.angleOverlays.map(({ degrees }) => degrees)).toEqual([90, 180]);

    points[27] = { ...points[27], visibility: 0.2 };
    expect(classifyPose("lunge", frame(points)).angleOverlays).toEqual([]);
  });
});
