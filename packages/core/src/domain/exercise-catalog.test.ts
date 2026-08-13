import { describe, expect, it } from "vitest";

import {
  EXERCISE_CATALOG,
  MUSCLE_GROUPS,
  getExerciseCatalogEntry,
  type CatalogExerciseId,
} from "./exercise-catalog";

describe("exercise catalog", () => {
  it("defines the seven major muscle groups", () => {
    expect(MUSCLE_GROUPS).toHaveLength(7);
    expect(new Set(MUSCLE_GROUPS.map((group) => group.id)).size).toBe(7);
  });

  it("gives every muscle group one or two primary bodyweight exercises", () => {
    for (const group of MUSCLE_GROUPS) {
      const entries = EXERCISE_CATALOG.filter(
        (entry) => entry.primaryMuscleGroup === group.id,
      );
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.length).toBeLessThanOrEqual(2);
      expect(entries.every((entry) => entry.equipment === "徒手")).toBe(true);
    }
  });

  it("gives every catalog exercise a complete detail entry", () => {
    const exerciseIds: CatalogExerciseId[] = [
      "push-up",
      "superman",
      "jumping-jack",
      "close-grip-push-up",
      "mountain-climber",
      "lunge",
      "squat",
    ];
    expect(EXERCISE_CATALOG.map((entry) => entry.id)).toEqual(exerciseIds);
    for (const exerciseId of exerciseIds) {
      const entry = getExerciseCatalogEntry(exerciseId);
      expect(entry.steps).toHaveLength(3);
      expect(entry.cues).toHaveLength(3);
      expect(entry.muscleGroups).toContain(entry.primaryMuscleGroup);
    }
  });
});
