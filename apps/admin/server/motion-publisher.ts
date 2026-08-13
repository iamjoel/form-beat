import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExerciseId } from "@workout-detect/core/domain/exercises";
import type { MotionProject } from "../src/lib/editor-model.ts";
import type { MotionStore, StoredMotion } from "./motion-store.ts";

const SUPPORTED_EXERCISE_IDS = new Set<ExerciseId>([
  "squat",
  "push-up",
  "jumping-jack",
  "lunge",
]);

export interface PublishResult {
  exerciseIds: ExerciseId[];
  outputPath: string;
  changed: boolean;
}

export function selectLatestReadyMotions(
  motions: readonly StoredMotion[],
): Partial<Record<ExerciseId, MotionProject>> {
  const selected: Partial<Record<ExerciseId, MotionProject>> = {};
  for (const motion of motions) {
    const exerciseId = motion.exerciseId as ExerciseId;
    if (!SUPPORTED_EXERCISE_IDS.has(exerciseId) || selected[exerciseId]) continue;
    selected[exerciseId] = motion.project;
  }
  return selected;
}

export function createPublishedMotionsSource(
  projects: Partial<Record<ExerciseId, MotionProject>>,
): string {
  return `import type { ExerciseId } from "../domain/exercises";
import type { MotionProject } from "../lib/motion-project";

/** Generated from ready records in the Form Beat Admin SQLite database. */
export const PUBLISHED_EXERCISE_MOTIONS: Partial<
  Record<ExerciseId, MotionProject>
> = ${JSON.stringify(projects, null, 2)};
`;
}

export function publishReadyMotions(
  store: MotionStore,
  outputPath: string,
): PublishResult {
  const projects = selectLatestReadyMotions(store.listReady());
  const source = createPublishedMotionsSource(projects);
  let previous = "";
  try {
    previous = readFileSync(outputPath, "utf8");
  } catch {
    // The generated module is created on the first publish.
  }
  if (previous !== source) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, source, "utf8");
  }
  return {
    exerciseIds: Object.keys(projects) as ExerciseId[],
    outputPath,
    changed: previous !== source,
  };
}
