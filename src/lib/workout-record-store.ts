import type {
  AvatarId,
  SaveWorkoutRecordInput,
  WorkoutRecordMetadata,
} from "../domain/records";
import type { ExerciseId } from "../domain/exercises";

const DATABASE_NAME = "form-01-workout-records";
const DATABASE_VERSION = 1;
const METADATA_STORE = "metadata";
const VIDEOS_STORE = "videos";
const COMPLETED_AT_INDEX = "completedAt";

const EXERCISE_IDS: readonly ExerciseId[] = [
  "squat",
  "push-up",
  "jumping-jack",
  "lunge",
];
const AVATAR_IDS: readonly AvatarId[] = ["none", "man", "woman"];

export type WorkoutRecordStoreErrorCode =
  | "UNSUPPORTED"
  | "INVALID_INPUT"
  | "QUOTA_EXCEEDED"
  | "OPEN_FAILED"
  | "SAVE_FAILED"
  | "READ_FAILED"
  | "DELETE_FAILED";

export class WorkoutRecordStoreError extends Error {
  readonly code: WorkoutRecordStoreErrorCode;

  constructor(
    code: WorkoutRecordStoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "WorkoutRecordStoreError";
    this.code = code;
  }
}

export function isWorkoutRecordStorageSupported(): boolean {
  try {
    return typeof globalThis.indexedDB !== "undefined";
  } catch {
    return false;
  }
}

export async function saveWorkoutRecord(
  input: SaveWorkoutRecordInput,
): Promise<WorkoutRecordMetadata> {
  const metadata = createMetadata(input);
  const database = await openDatabase();

  try {
    const transaction = database.transaction(
      [METADATA_STORE, VIDEOS_STORE],
      "readwrite",
    );

    try {
      transaction.objectStore(METADATA_STORE).add(metadata);
      transaction.objectStore(VIDEOS_STORE).add(input.video, metadata.id);
    } catch (error) {
      abortTransaction(transaction);
      throw error;
    }

    await waitForTransaction(transaction);
    return metadata;
  } catch (error) {
    throw toStoreError(error, "SAVE_FAILED", "Unable to save the workout record.");
  } finally {
    database.close();
  }
}

export async function listWorkoutRecords(): Promise<WorkoutRecordMetadata[]> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(METADATA_STORE, "readonly");
    const recordsRequest = transaction
      .objectStore(METADATA_STORE)
      .index(COMPLETED_AT_INDEX)
      .getAll();
    const [storedRecords] = await Promise.all([
      requestResult(recordsRequest),
      waitForTransaction(transaction),
    ]);

    const records = storedRecords.map(assertWorkoutRecordMetadata);
    records.sort(
      (left, right) =>
        right.completedAt - left.completedAt || right.id.localeCompare(left.id),
    );
    return records;
  } catch (error) {
    throw toStoreError(error, "READ_FAILED", "Unable to list workout records.");
  } finally {
    database.close();
  }
}

export async function getWorkoutVideo(id: string): Promise<Blob | null> {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new WorkoutRecordStoreError(
      "INVALID_INPUT",
      "A workout record id is required.",
    );
  }

  const database = await openDatabase();

  try {
    const transaction = database.transaction(VIDEOS_STORE, "readonly");
    const videoRequest = transaction.objectStore(VIDEOS_STORE).get(id);
    const [storedVideo] = await Promise.all([
      requestResult(videoRequest),
      waitForTransaction(transaction),
    ]);

    if (storedVideo === undefined) return null;
    if (!(storedVideo instanceof Blob)) {
      throw new WorkoutRecordStoreError(
        "READ_FAILED",
        `The stored video for workout record "${id}" is invalid.`,
      );
    }

    return storedVideo;
  } catch (error) {
    throw toStoreError(error, "READ_FAILED", "Unable to read the workout video.");
  } finally {
    database.close();
  }
}

export async function deleteWorkoutRecord(id: string): Promise<void> {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new WorkoutRecordStoreError(
      "INVALID_INPUT",
      "A workout record id is required.",
    );
  }

  const database = await openDatabase();

  try {
    const transaction = database.transaction(
      [METADATA_STORE, VIDEOS_STORE],
      "readwrite",
    );

    try {
      transaction.objectStore(METADATA_STORE).delete(id);
      transaction.objectStore(VIDEOS_STORE).delete(id);
    } catch (error) {
      abortTransaction(transaction);
      throw error;
    }

    await waitForTransaction(transaction);
  } catch (error) {
    throw toStoreError(
      error,
      "DELETE_FAILED",
      "Unable to delete the workout record.",
    );
  } finally {
    database.close();
  }
}

function createMetadata(input: SaveWorkoutRecordInput): WorkoutRecordMetadata {
  if (!isExerciseId(input.exerciseId)) {
    throw new WorkoutRecordStoreError(
      "INVALID_INPUT",
      "The workout exercise id is invalid.",
    );
  }
  if (!isAvatarId(input.avatar)) {
    throw new WorkoutRecordStoreError(
      "INVALID_INPUT",
      "The workout avatar is invalid.",
    );
  }
  assertNonNegativeInteger(input.completedReps, "completedReps");
  assertPositiveInteger(input.targetReps, "targetReps");
  assertNonNegativeInteger(input.durationSeconds, "durationSeconds");

  if (
    typeof Blob === "undefined" ||
    !(input.video instanceof Blob) ||
    input.video.size === 0
  ) {
    throw new WorkoutRecordStoreError(
      "INVALID_INPUT",
      "The workout video must be a non-empty Blob.",
    );
  }

  const completedAt = input.completedAt ?? Date.now();
  if (!Number.isFinite(completedAt) || completedAt <= 0) {
    throw new WorkoutRecordStoreError(
      "INVALID_INPUT",
      "The workout completion timestamp is invalid.",
    );
  }

  return {
    id: createRecordId(completedAt),
    exerciseId: input.exerciseId,
    completedAt,
    completedReps: input.completedReps,
    targetReps: input.targetReps,
    durationSeconds: input.durationSeconds,
    avatar: input.avatar,
    mimeType: input.video.type.trim() || "application/octet-stream",
    size: input.video.size,
  };
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!isWorkoutRecordStorageSupported()) {
    throw new WorkoutRecordStoreError(
      "UNSUPPORTED",
      "This browser does not support IndexedDB workout storage.",
    );
  }

  let request: IDBOpenDBRequest;
  try {
    request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  } catch (error) {
    throw toStoreError(error, "OPEN_FAILED", "Unable to open workout storage.");
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;

    const rejectOnce = (error: WorkoutRecordStoreError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) return;

      const metadataStore = database.objectStoreNames.contains(METADATA_STORE)
        ? transaction.objectStore(METADATA_STORE)
        : database.createObjectStore(METADATA_STORE, { keyPath: "id" });

      if (!metadataStore.indexNames.contains(COMPLETED_AT_INDEX)) {
        metadataStore.createIndex(COMPLETED_AT_INDEX, "completedAt", {
          unique: false,
        });
      }

      if (!database.objectStoreNames.contains(VIDEOS_STORE)) {
        database.createObjectStore(VIDEOS_STORE);
      }
    };

    request.onerror = () => {
      rejectOnce(
        toStoreError(
          request.error,
          "OPEN_FAILED",
          "Unable to open workout storage.",
        ),
      );
    };

    request.onblocked = () => {
      rejectOnce(
        new WorkoutRecordStoreError(
          "OPEN_FAILED",
          "Workout storage is blocked by another open version of the app.",
        ),
      );
    };

    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }

      if (
        !database.objectStoreNames.contains(METADATA_STORE) ||
        !database.objectStoreNames.contains(VIDEOS_STORE)
      ) {
        database.close();
        rejectOnce(
          new WorkoutRecordStoreError(
            "OPEN_FAILED",
            "Workout storage has an invalid schema.",
          ),
        );
        return;
      }

      settled = true;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

function abortTransaction(transaction: IDBTransaction): void {
  try {
    transaction.abort();
  } catch {
    // The transaction may already have failed or completed.
  }
}

function assertWorkoutRecordMetadata(value: unknown): WorkoutRecordMetadata {
  if (!isObject(value)) {
    throw new WorkoutRecordStoreError(
      "READ_FAILED",
      "Stored workout metadata is invalid.",
    );
  }

  const record = value as Partial<WorkoutRecordMetadata>;
  if (
    typeof record.id !== "string" ||
    record.id.trim().length === 0 ||
    !isExerciseId(record.exerciseId) ||
    typeof record.completedAt !== "number" ||
    !Number.isFinite(record.completedAt) ||
    record.completedAt <= 0 ||
    typeof record.completedReps !== "number" ||
    !Number.isInteger(record.completedReps) ||
    record.completedReps < 0 ||
    typeof record.targetReps !== "number" ||
    !Number.isInteger(record.targetReps) ||
    record.targetReps <= 0 ||
    typeof record.durationSeconds !== "number" ||
    !Number.isInteger(record.durationSeconds) ||
    record.durationSeconds < 0 ||
    !isAvatarId(record.avatar) ||
    typeof record.mimeType !== "string" ||
    record.mimeType.trim().length === 0 ||
    typeof record.size !== "number" ||
    !Number.isFinite(record.size) ||
    record.size <= 0
  ) {
    throw new WorkoutRecordStoreError(
      "READ_FAILED",
      "Stored workout metadata is invalid.",
    );
  }

  return record as WorkoutRecordMetadata;
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new WorkoutRecordStoreError(
      "INVALID_INPUT",
      `${field} must be a non-negative integer.`,
    );
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new WorkoutRecordStoreError(
      "INVALID_INPUT",
      `${field} must be a positive integer.`,
    );
  }
}

function createRecordId(completedAt: number): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const timestamp = Math.floor(completedAt).toString(36);
  if (typeof cryptoApi?.getRandomValues === "function") {
    const randomValues = cryptoApi.getRandomValues(new Uint32Array(2));
    return `workout_${timestamp}_${randomValues[0].toString(36)}${randomValues[1].toString(36)}`;
  }

  return `workout_${timestamp}_${Math.random().toString(36).slice(2)}`;
}

function isExerciseId(value: unknown): value is ExerciseId {
  return EXERCISE_IDS.includes(value as ExerciseId);
}

function isAvatarId(value: unknown): value is AvatarId {
  return AVATAR_IDS.includes(value as AvatarId);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStoreError(
  error: unknown,
  fallbackCode: WorkoutRecordStoreErrorCode,
  fallbackMessage: string,
): WorkoutRecordStoreError {
  if (error instanceof WorkoutRecordStoreError) return error;

  const errorName = getErrorName(error);
  if (errorName === "QuotaExceededError") {
    return new WorkoutRecordStoreError(
      "QUOTA_EXCEEDED",
      "There is not enough device storage for this workout video.",
      { cause: error },
    );
  }

  return new WorkoutRecordStoreError(fallbackCode, fallbackMessage, {
    cause: error,
  });
}

function getErrorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return undefined;
  }
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}
