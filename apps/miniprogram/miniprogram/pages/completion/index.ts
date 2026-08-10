import {
  EXERCISES,
  getExercise,
  type ExerciseId,
} from "../../shared/core/domain/exercises";
import { formatDuration } from "../../shared/core/domain/session";

interface CompletionPageInstance {
  data: {
    exerciseLabel: string;
    count: number;
    target: number;
    durationLabel: string;
  };
  setData(data: Partial<CompletionPageInstance["data"]>): void;
}

Page({
  data: {
    exerciseLabel: EXERCISES[0].label,
    count: 0,
    target: 0,
    durationLabel: "0 秒",
  },

  onLoad(this: CompletionPageInstance, query: Record<string, string | undefined>) {
    const exerciseId = EXERCISES.some((exercise) => exercise.id === query.exercise)
      ? (query.exercise as ExerciseId)
      : EXERCISES[0].id;
    const count = Math.max(0, Number(query.count) || 0);
    const target = Math.max(1, Number(query.target) || 1);
    const durationSeconds = Math.max(0, Number(query.duration) || 0);
    this.setData({
      exerciseLabel: getExercise(exerciseId).label,
      count,
      target,
      durationLabel: formatDuration(durationSeconds),
    });
  },

  backHome() {
    wx.navigateBack({ delta: 1 });
  },

  openRecords() {
    wx.redirectTo({ url: "/pages/records/index" });
  },
});
