/** A completed workout summary, shared by tracking and presentation layers. */
export interface CompletionStats {
  completedReps: number;
  targetReps: number;
  durationSeconds: number;
  /** Pose visibility quality on a 0–100 scale, when available. */
  accuracy?: number;
}

export const MIN_SAVED_WORKOUT_DURATION_MS = 10_000;

export function shouldSavePartialWorkout(durationMilliseconds: number): boolean {
  return (
    Number.isFinite(durationMilliseconds) &&
    durationMilliseconds >= MIN_SAVED_WORKOUT_DURATION_MS
  );
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds} 秒`;
}
