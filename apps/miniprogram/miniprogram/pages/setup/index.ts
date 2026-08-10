import {
  EXERCISES,
  type ExerciseId,
} from "../../shared/core/domain/exercises";

const PREFERENCES_KEY = "workout-detect:preferences:v1";
const MIN_TARGET = 1;
const MAX_TARGET = 99;

interface Preferences {
  exerciseId: ExerciseId;
  target: number;
}

interface SetupPageInstance {
  data: Preferences & {
    exercises: typeof EXERCISES;
    cameraHint: string;
    exerciseLabel: string;
  };
  setData(data: Partial<SetupPageInstance["data"]>): void;
}

function readPreferences(): Preferences {
  const stored = wx.getStorageSync(PREFERENCES_KEY) as Partial<Preferences> | null;
  const exercise = EXERCISES.find((item) => item.id === stored?.exerciseId);
  const target = Number(stored?.target);
  return {
    exerciseId: exercise?.id ?? EXERCISES[0].id,
    target:
      Number.isFinite(target) && target >= MIN_TARGET && target <= MAX_TARGET
        ? Math.round(target)
        : exercise?.defaultTarget ?? EXERCISES[0].defaultTarget,
  };
}

function savePreferences(preferences: Preferences): void {
  wx.setStorageSync(PREFERENCES_KEY, preferences);
}

function getExerciseCopy(exerciseId: ExerciseId) {
  const exercise =
    EXERCISES.find((item) => item.id === exerciseId) ?? EXERCISES[0];
  return {
    cameraHint: exercise.cameraHint,
    exerciseLabel: exercise.label,
  };
}

const initialPreferences = readPreferences();

Page({
  data: {
    exercises: EXERCISES,
    ...initialPreferences,
    ...getExerciseCopy(initialPreferences.exerciseId),
  },

  onShow(this: SetupPageInstance) {
    const preferences = readPreferences();
    this.setData({
      ...preferences,
      ...getExerciseCopy(preferences.exerciseId),
    });
  },

  selectExercise(this: SetupPageInstance, event: MiniProgramEvent) {
    const exerciseId = event.currentTarget.dataset.id as ExerciseId;
    const exercise = EXERCISES.find((item) => item.id === exerciseId);
    if (!exercise) return;
    const next = {
      exerciseId,
      target: exercise.defaultTarget,
      ...getExerciseCopy(exerciseId),
    };
    this.setData(next);
    savePreferences({ exerciseId, target: exercise.defaultTarget });
  },

  changeTarget(this: SetupPageInstance, event: MiniProgramEvent) {
    const delta = Number(event.currentTarget.dataset.delta);
    if (!Number.isFinite(delta)) return;
    const target = Math.min(
      MAX_TARGET,
      Math.max(MIN_TARGET, this.data.target + delta),
    );
    this.setData({ target });
    savePreferences({ exerciseId: this.data.exerciseId, target });
  },

  startWorkout(this: SetupPageInstance) {
    savePreferences({
      exerciseId: this.data.exerciseId,
      target: this.data.target,
    });
    wx.navigateTo({
      url: `/pages/workout/index?exercise=${this.data.exerciseId}&target=${this.data.target}`,
    });
  },

  openRecords() {
    wx.navigateTo({ url: "/pages/records/index" });
  },
});
