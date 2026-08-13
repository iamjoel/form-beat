import {
  listWorkoutRecords,
  type MiniProgramWorkoutRecord,
} from "../../lib/workout-records";

interface CalendarCell {
  key: string;
  day: number;
  blank: boolean;
  hasWorkout: boolean;
  isToday: boolean;
  ariaLabel: string;
}

interface FitnessPageData {
  weekdays: readonly string[];
  calendarCells: CalendarCell[];
  currentDateLabel: string;
  monthLabel: string;
  todayKey: string;
  todaySessions: number;
  todayReps: number;
  todayDuration: string;
}

interface FitnessPageInstance {
  data: FitnessPageData;
  setData(data: Partial<FitnessPageData>): void;
  visibleMonth: Date;
  records: MiniProgramWorkoutRecord[];
  reloadRecords(): void;
  refreshCalendar(): void;
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"] as const;

Page({
  data: {
    weekdays: WEEKDAYS,
    calendarCells: [],
    currentDateLabel: "",
    monthLabel: "",
    todayKey: "",
    todaySessions: 0,
    todayReps: 0,
    todayDuration: "0秒",
  } satisfies FitnessPageData,

  onLoad(this: FitnessPageInstance) {
    this.visibleMonth = startOfMonth(new Date());
    this.records = [];
  },

  onShow(this: FitnessPageInstance) {
    this.reloadRecords();
  },

  reloadRecords(this: FitnessPageInstance) {
    this.records = listWorkoutRecords();
    const today = new Date();
    const todayKey = toDateKey(today);
    const todayRecords = this.records.filter(
      (record) => toDateKey(new Date(record.completedAt)) === todayKey,
    );
    const reps = todayRecords.reduce((total, record) => total + record.completedReps, 0);
    const seconds = todayRecords.reduce((total, record) => total + record.durationSeconds, 0);
    this.setData({
      todayKey,
      currentDateLabel: `${today.getFullYear()}年${today.getMonth() + 1}月`,
      todaySessions: todayRecords.length,
      todayReps: reps,
      todayDuration: formatCompactDuration(seconds),
    });
    this.refreshCalendar();
  },

  refreshCalendar(this: FitnessPageInstance) {
    const todayKey = toDateKey(new Date());
    const recordsByDate = new Map<string, number>();
    for (const record of this.records) {
      const key = toDateKey(new Date(record.completedAt));
      recordsByDate.set(key, (recordsByDate.get(key) ?? 0) + 1);
    }

    const first = startOfMonth(this.visibleMonth);
    const leading = (first.getDay() + 6) % 7;
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: CalendarCell[] = [];
    for (let index = 0; index < leading; index += 1) {
      cells.push({
        key: `blank-${index}`,
        day: 0,
        blank: true,
        hasWorkout: false,
        isToday: false,
        ariaLabel: "",
      });
    }
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const key = toDateKey(date);
      const count = recordsByDate.get(key) ?? 0;
      cells.push({
        key,
        day,
        blank: false,
        hasWorkout: count > 0,
        isToday: key === todayKey,
        ariaLabel: `${date.getMonth() + 1}月${day}日${count > 0 ? `，${count}次训练，查看详情` : "，无训练"}`,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({
        key: `blank-tail-${cells.length}`,
        day: 0,
        blank: true,
        hasWorkout: false,
        isToday: false,
        ariaLabel: "",
      });
    }
    this.setData({
      calendarCells: cells,
      monthLabel: `${first.getFullYear()}年${first.getMonth() + 1}月`,
    });
  },

  changeMonth(this: FitnessPageInstance, event: MiniProgramEvent) {
    const delta = Number(event.currentTarget.dataset.delta);
    if (!Number.isFinite(delta)) return;
    this.visibleMonth = new Date(
      this.visibleMonth.getFullYear(),
      this.visibleMonth.getMonth() + delta,
      1,
    );
    this.refreshCalendar();
  },

  openDay(this: FitnessPageInstance, event: MiniProgramEvent) {
    const date = String(event.currentTarget.dataset.date ?? "");
    if (!date) return;
    wx.navigateTo({ url: `/pages/fitness-detail/index?date=${date}` });
  },

  openWorkout() {
    wx.redirectTo({ url: "/pages/setup/index" });
  },

  openActions() {
    wx.redirectTo({ url: "/pages/actions/index" });
  },

  openProfile() {
    wx.redirectTo({ url: "/pages/profile/index" });
  },
});

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toDateKey(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatCompactDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${seconds % 60 ? `${seconds % 60}秒` : ""}`;
}
