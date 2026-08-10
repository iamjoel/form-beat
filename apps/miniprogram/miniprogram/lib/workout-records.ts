import type { ExerciseId } from "../shared/core/domain/exercises";

export interface MiniProgramWorkoutRecord {
  id: string;
  exerciseId: ExerciseId;
  completedAt: number;
  completedReps: number;
  targetReps: number;
  durationSeconds: number;
  videoPath: string;
}

export interface SaveMiniProgramWorkoutRecordInput {
  exerciseId: ExerciseId;
  completedReps: number;
  targetReps: number;
  durationSeconds: number;
  tempVideoPath: string;
}

const STORAGE_KEY = "workout-detect:records:v1";

function isRecord(value: unknown): value is MiniProgramWorkoutRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MiniProgramWorkoutRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.exerciseId === "string" &&
    typeof record.completedAt === "number" &&
    typeof record.completedReps === "number" &&
    typeof record.targetReps === "number" &&
    typeof record.durationSeconds === "number" &&
    typeof record.videoPath === "string"
  );
}

export function listWorkoutRecords(): MiniProgramWorkoutRecord[] {
  const stored = wx.getStorageSync(STORAGE_KEY);
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(isRecord)
    .sort((left, right) => right.completedAt - left.completedAt);
}

function persistRecords(records: readonly MiniProgramWorkoutRecord[]): void {
  wx.setStorageSync(STORAGE_KEY, records);
}

function saveFile(tempFilePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      success: ({ savedFilePath }) => resolve(savedFilePath),
      fail: reject,
    });
  });
}

function unlinkFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().unlink({
      filePath,
      success: resolve,
      fail: reject,
    });
  });
}

export async function saveWorkoutRecord(
  input: SaveMiniProgramWorkoutRecordInput,
): Promise<MiniProgramWorkoutRecord> {
  const videoPath = await saveFile(input.tempVideoPath);
  const completedAt = Date.now();
  const record: MiniProgramWorkoutRecord = {
    id: `${completedAt}-${Math.random().toString(36).slice(2, 9)}`,
    exerciseId: input.exerciseId,
    completedAt,
    completedReps: input.completedReps,
    targetReps: input.targetReps,
    durationSeconds: input.durationSeconds,
    videoPath,
  };

  try {
    persistRecords([record, ...listWorkoutRecords()]);
    return record;
  } catch (error) {
    await unlinkFile(videoPath).catch(() => undefined);
    throw error;
  }
}

export async function deleteWorkoutRecord(recordId: string): Promise<void> {
  const records = listWorkoutRecords();
  const record = records.find((item) => item.id === recordId);
  if (!record) return;

  await unlinkFile(record.videoPath);
  persistRecords(records.filter((item) => item.id !== recordId));
}
