import {
  getExerciseCatalogEntry,
  type CatalogExerciseId,
} from "../domain/exercise-catalog";
import { PUBLISHED_EXERCISE_MOTIONS } from "../generated/published-exercise-motions";
import { getBuiltInExerciseDemoProject } from "./exercise-demo";
import {
  getMotionFrame,
  type MotionFrame,
  type MotionProject,
} from "./motion-project";

/** Returns the published Admin project, with the source-controlled motion as fallback. */
export function getExerciseDemoProject(exerciseId: CatalogExerciseId): MotionProject {
  const trainingExerciseId = getExerciseCatalogEntry(exerciseId).trainingExerciseId;
  return (trainingExerciseId ? PUBLISHED_EXERCISE_MOTIONS[trainingExerciseId] : undefined)
    ?? getBuiltInExerciseDemoProject(exerciseId);
}

/** Evaluates the complete multi-keyframe motion used by client demos. */
export function getExerciseDemoMotionFrame(
  exerciseId: CatalogExerciseId,
  elapsedMs: number,
): MotionFrame {
  return getMotionFrame(getExerciseDemoProject(exerciseId), elapsedMs);
}
