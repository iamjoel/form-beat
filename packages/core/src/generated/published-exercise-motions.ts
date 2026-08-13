import type { ExerciseId } from "../domain/exercises";
import type { MotionProject } from "../lib/motion-project";

/** Generated from ready records in the Form Beat Admin SQLite database. */
export const PUBLISHED_EXERCISE_MOTIONS: Partial<
  Record<ExerciseId, MotionProject>
> = {};
