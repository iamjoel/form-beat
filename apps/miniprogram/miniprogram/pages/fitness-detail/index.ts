import { getExercise } from "../../shared/core/domain/exercises";
import { formatDuration } from "../../shared/core/domain/session";
import {
  deleteWorkoutRecord,
  listWorkoutRecords,
  type MiniProgramWorkoutRecord,
} from "../../lib/workout-records";

interface RecordView extends MiniProgramWorkoutRecord {
  exerciseLabel: string;
  timeLabel: string;
  durationLabel: string;
}

interface DetailPageData {
  dateKey: string;
  dateLabel: string;
  records: RecordView[];
  sessions: number;
  totalReps: number;
  totalDuration: string;
  deletingId: string;
}

interface DetailPageInstance {
  data: DetailPageData;
  setData(data: Partial<DetailPageData>): void;
  reloadRecords(): void;
}

Page({
  data: {
    dateKey: "",
    dateLabel: "",
    records: [],
    sessions: 0,
    totalReps: 0,
    totalDuration: "0秒",
    deletingId: "",
  } satisfies DetailPageData,

  onLoad(this: DetailPageInstance, query: Record<string, string | undefined>) {
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "")
      ? String(query.date)
      : toDateKey(new Date());
    this.setData({ dateKey, dateLabel: formatDetailDate(dateKey) });
  },

  onShow(this: DetailPageInstance) {
    this.reloadRecords();
  },

  reloadRecords(this: DetailPageInstance) {
    const records = listWorkoutRecords()
      .filter((record) => toDateKey(new Date(record.completedAt)) === this.data.dateKey)
      .map((record) => ({
        ...record,
        exerciseLabel: getExercise(record.exerciseId).label,
        timeLabel: formatTime(new Date(record.completedAt)),
        durationLabel: formatDuration(record.durationSeconds),
      }));
    this.setData({
      records,
      sessions: records.length,
      totalReps: records.reduce((total, record) => total + record.completedReps, 0),
      totalDuration: formatCompactDuration(
        records.reduce((total, record) => total + record.durationSeconds, 0),
      ),
    });
  },

  saveVideo(this: DetailPageInstance, event: MiniProgramEvent) {
    const id = String(event.currentTarget.dataset.id ?? "");
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.saveVideoToPhotosAlbum({
      filePath: record.videoPath,
      success: () => wx.showToast({ title: "已保存到相册", icon: "success" }),
      fail: () => wx.showToast({ title: "请允许相册权限", icon: "none" }),
    });
  },

  requestDelete(this: DetailPageInstance, event: MiniProgramEvent) {
    const id = String(event.currentTarget.dataset.id ?? "");
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;
    wx.showModal({
      title: "删除训练记录？",
      content: `这会同时删除本机保存的${record.exerciseLabel}录像。`,
      confirmText: "删除",
      confirmColor: "#c94132",
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ deletingId: id });
        void deleteWorkoutRecord(id)
          .then(() => {
            this.reloadRecords();
            wx.showToast({ title: "已删除", icon: "success" });
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "none" }))
          .finally(() => this.setData({ deletingId: "" }));
      },
    });
  },

  goBack() {
    wx.navigateBack();
  },
});

function toDateKey(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDetailDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${month}月${day}日 ${weekdays[date.getDay()]}`;
}

function formatTime(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatCompactDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${seconds % 60 ? `${seconds % 60}秒` : ""}`;
}
