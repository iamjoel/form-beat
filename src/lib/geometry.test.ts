import { describe, expect, it } from "vitest";
import { coverVisibleBounds, jointAngle } from "./geometry";

describe("jointAngle", () => {
  it("calculates a right angle", () => {
    expect(
      jointAngle(
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ),
    ).toBeCloseTo(90);
  });

  it("calculates a straight joint", () => {
    expect(
      jointAngle(
        { x: -1, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ),
    ).toBeCloseTo(180);
  });

  it("corrects normalized 2D coordinates for a non-square video", () => {
    const normalized = jointAngle(
      { x: 0.75, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.75 },
      { width: 720, height: 1_280 },
    );

    expect(normalized).toBeCloseTo(90);
  });

  it("is invariant when a pose is mirrored", () => {
    const original = jointAngle(
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.5 },
      { x: 0.65, y: 0.72 },
      { width: 720, height: 1_280 },
    );
    const mirrored = jointAngle(
      { x: 0.8, y: 0.2 },
      { x: 0.6, y: 0.5 },
      { x: 0.35, y: 0.72 },
      { width: 720, height: 1_280 },
    );

    expect(mirrored).toBeCloseTo(original);
  });
});

describe("coverVisibleBounds", () => {
  it("reports the horizontally cropped source area for a taller viewport", () => {
    expect(
      coverVisibleBounds(
        { width: 720, height: 1_280 },
        { width: 390, height: 844 },
      ),
    ).toEqual({
      minX: expect.closeTo(0.089, 2),
      maxX: expect.closeTo(0.911, 2),
      minY: 0,
      maxY: 1,
    });
  });

  it("keeps the whole source visible when aspect ratios match", () => {
    expect(
      coverVisibleBounds(
        { width: 720, height: 1_280 },
        { width: 360, height: 640 },
      ),
    ).toEqual({ minX: 0, maxX: 1, minY: 0, maxY: 1 });
  });
});
