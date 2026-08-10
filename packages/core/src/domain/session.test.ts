import { describe, expect, it } from "vitest";

import {
  MIN_SAVED_WORKOUT_DURATION_MS,
  shouldSavePartialWorkout,
} from "./session";

describe("shouldSavePartialWorkout", () => {
  it("keeps a workout at the ten-second boundary", () => {
    expect(shouldSavePartialWorkout(MIN_SAVED_WORKOUT_DURATION_MS)).toBe(true);
  });

  it("discards a workout shorter than ten seconds", () => {
    expect(shouldSavePartialWorkout(MIN_SAVED_WORKOUT_DURATION_MS - 1)).toBe(
      false,
    );
  });

  it("rejects invalid durations", () => {
    expect(shouldSavePartialWorkout(Number.NaN)).toBe(false);
    expect(shouldSavePartialWorkout(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
