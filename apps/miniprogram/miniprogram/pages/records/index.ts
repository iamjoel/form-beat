import { getExercise } from "../../shared/core/domain/exercises";
import { formatDuration } from "../../shared/core/domain/session";
import {
  deleteWorkoutRecord,
  listWorkoutRecords,
  type MiniProgramWorkoutRecord,
} from "../../lib/workout-records";

interface RecordView extends MiniProgramWorkoutRecord {
  exerciseLabel: string;
  dateLabel: string;
  durationLabel: string;
}

interface RecordsPageInstance {
  data: {
    records: RecordView[];
    deletingId: string;
  };
  setData(data: Partial<RecordsPageInstance["data"]>): void;
  reloadRecords(): void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    records: [],
    deletingId: "",
  },

  onShow(this: RecordsPageInstance) {
    this.reloadRecords();
  },

  reloadRecords(this: RecordsPageInstance) {
    const records = listWorkoutRecords().map((record) => ({
      ...record,
      exerciseLabel: getExercise(record.exerciseId).label,
      dateLabel: formatDate(record.completedAt),
      durationLabel: formatDuration(record.durationSeconds),
    }));
    this.setData({ records });
  },

  saveVideo(this: RecordsPageInstance, event: MiniProgramEvent) {
    const id = String(event.currentTarget.dataset.id ?? "");
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.saveVideoToPhotosAlbum({
      filePath: record.videoPath,
      success: () => wx.showToast({ title: "已保存到相册", icon: "success" }),
      fail: (error) => {
        console.warn("保存到相册失败", error);
        wx.showToast({ title: "请允许相册权限", icon: "none" });
      },
    });
  },

  requestDelete(this: RecordsPageInstance, event: MiniProgramEvent) {
    const id = String(event.currentTarget.dataset.id ?? "");
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.showModal({
      title: "删除训练记录？",
      content: `这会同时删除本机保存的${record.exerciseLabel}录像。`,
      confirmText: "删除",
      confirmColor: "#b82e2e",
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ deletingId: id });
        void deleteWorkoutRecord(id)
          .then(() => {
            this.reloadRecords();
            wx.showToast({ title: "已删除", icon: "success" });
          })
          .catch((error) => {
            console.error("删除训练录像失败", error);
            wx.showToast({ title: "删除失败", icon: "none" });
          })
          .finally(() => this.setData({ deletingId: "" }));
      },
    });
  },

  startWorkout() {
    wx.navigateBack();
  },
});
