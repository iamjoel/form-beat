import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG } from "@workout-detect/core/domain/exercise-catalog";

import {
  getExerciseRoutePath,
  getMainRoutePath,
  parseAppRoute,
} from "./app-route";

describe("app routes", () => {
  it("maps each main tab to a stable address", () => {
    expect(getMainRoutePath("fitness")).toBe("/fitness");
    expect(getMainRoutePath("workout")).toBe("/");
    expect(getMainRoutePath("exercises")).toBe("/actions");
    expect(getMainRoutePath("profile")).toBe("/profile");
  });

  it.each(EXERCISE_CATALOG)(
    "gives $label its own direct route",
    (exercise) => {
      const pathname = getExerciseRoutePath(exercise.id);
      expect(parseAppRoute(pathname)).toEqual({
        destination: "exercises",
        exerciseId: exercise.id,
      });
    },
  );

  it("accepts trailing slashes and falls back from an unknown action", () => {
    expect(parseAppRoute("/actions/squat/").exerciseId).toBe("squat");
    expect(parseAppRoute("/actions/not-found")).toEqual({
      destination: "exercises",
      exerciseId: null,
    });
  });
});
