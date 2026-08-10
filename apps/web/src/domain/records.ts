import type { ExerciseId } from "@workout-detect/core/domain/exercises";

export type AvatarId = "none" | "man" | "woman";

export interface WorkoutRecordMetadata {
  id: string;
  exerciseId: ExerciseId;
  completedAt: number;
  completedReps: number;
  targetReps: number;
  durationSeconds: number;
  avatar: AvatarId;
  mimeType: string;
  size: number;
}

export interface SaveWorkoutRecordInput {
  exerciseId: ExerciseId;
  completedAt?: number;
  completedReps: number;
  targetReps: number;
  durationSeconds: number;
  avatar: AvatarId;
  video: Blob;
}
