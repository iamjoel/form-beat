import {
  EXERCISE_CATALOG,
  type CatalogExerciseId,
} from "@workout-detect/core/domain/exercise-catalog";

export type MainNavDestination = "fitness" | "exercises" | "workout" | "profile";

export interface AppRoute {
  destination: MainNavDestination;
  exerciseId: CatalogExerciseId | null;
}

const EXERCISE_IDS = new Set<string>(
  EXERCISE_CATALOG.map((exercise) => exercise.id),
);

const MAIN_ROUTE_PATHS: Record<MainNavDestination, string> = {
  fitness: "/fitness",
  exercises: "/actions",
  workout: "/",
  profile: "/profile",
};

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

function isCatalogExerciseId(value: string): value is CatalogExerciseId {
  return EXERCISE_IDS.has(value);
}

export function getMainRoutePath(destination: MainNavDestination): string {
  return MAIN_ROUTE_PATHS[destination];
}

export function getExerciseRoutePath(exerciseId: CatalogExerciseId): string {
  return `${MAIN_ROUTE_PATHS.exercises}/${exerciseId}`;
}

export function parseAppRoute(pathname: string): AppRoute {
  const normalizedPathname = normalizePathname(pathname);

  for (const destination of ["fitness", "profile"] as const) {
    if (normalizedPathname === MAIN_ROUTE_PATHS[destination]) {
      return { destination, exerciseId: null };
    }
  }

  if (normalizedPathname === MAIN_ROUTE_PATHS.exercises) {
    return { destination: "exercises", exerciseId: null };
  }

  if (normalizedPathname.startsWith(`${MAIN_ROUTE_PATHS.exercises}/`)) {
    const exerciseId = normalizedPathname.slice(
      MAIN_ROUTE_PATHS.exercises.length + 1,
    );
    return {
      destination: "exercises",
      exerciseId: isCatalogExerciseId(exerciseId) ? exerciseId : null,
    };
  }

  return { destination: "workout", exerciseId: null };
}
