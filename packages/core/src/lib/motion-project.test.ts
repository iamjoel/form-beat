import { describe, expect, it } from "vitest";

import type { MotionProject } from "./motion-project";
import {
  getMotionFrame,
  normalizeMotionTime,
} from "./motion-project";

function points(x: number) {
  return Array.from({ length: 33 }, (_, index) => ({
    x,
    y: index === 13 ? 0.7 : 0.5,
    visibility: index === 11 || index === 13 || index === 15 ? 1 : 0,
  }));
}

function project(): MotionProject {
  return {
    schemaVersion: 1,
    name: "test",
    durationMs: 1_000,
    easing: "linear",
    loop: true,
    canvas: { width: 100, height: 100 },
    reference: { exerciseId: "push-up", visible: true, opacity: 1 },
    display: { skeleton: true, joints: true, angles: true },
    skeleton: { connections: [[11, 13], [13, 15]] },
    keyframes: [
      { id: "a", name: "A", timeMs: 0, referenceFrame: 0, points: points(0.2) },
      { id: "b", name: "B", timeMs: 1_000, referenceFrame: 1, points: points(0.8) },
    ],
    annotations: [{
      id: "elbow",
      label: "肘角",
      startIndex: 11,
      vertexIndex: 13,
      endIndex: 15,
      radius: 0.05,
      labelOffset: { x: 0, y: 0 },
    }],
  };
}

describe("motion project runtime", () => {
  it("normalizes looping and clamped playback time", () => {
    expect(normalizeMotionTime(project(), 1_250)).toBe(250);
    expect(normalizeMotionTime({ durationMs: 1_000, loop: false }, 1_250)).toBe(1_000);
  });

  it("interpolates pose data and derives annotation angles", () => {
    const frame = getMotionFrame(project(), 500);
    expect(frame.landmarks[11].x).toBeCloseTo(0.5);
    expect(frame.referenceFrame).toBe(1);
    expect(frame.angleOverlays).toHaveLength(1);
    expect(frame.angleOverlays[0].id).toBe("elbow");
  });
});
