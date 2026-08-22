import { useEffect, useMemo, useState } from "react";
import { getExercise } from "@workout-detect/core/domain/exercises";
import { formatDuration } from "@workout-detect/core/domain/session";

import type { WorkoutRecordMetadata } from "../domain/records";
import {
  deleteWorkoutRecord,
  getWorkoutVideo,
  listWorkoutRecords,
} from "../lib/workout-record-store";
import { MainNav, type MainNavDestination } from "./MainNav";

interface FitnessScreenProps {
  onNavigate: (destination: Exclude<MainNavDestination, "fitness">) => void;
}

type FitnessState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; records: WorkoutRecordMetadata[] };

type VideoState =
  | { status: "loading" }
  | { status: "missing" | "error" }
  | { status: "ready"; url: string; blob: Blob };

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"] as const;
const MONTH_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
});
const DETAIL_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function FitnessScreen({ onNavigate }: FitnessScreenProps) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<FitnessState>({ status: "loading" });
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const currentMonth = startOfMonth(new Date());
  const canGoNextMonth = month.getTime() < currentMonth.getTime();

  const changeMonth = (amount: -1 | 1) => {
    setMonth((visibleMonth) => {
      const candidate = addMonths(visibleMonth, amount);
      const latestAllowedMonth = startOfMonth(new Date());
      return candidate.getTime() > latestAllowedMonth.getTime()
        ? latestAllowedMonth
        : candidate;
    });
  };

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void listWorkoutRecords()
      .then((records) => {
        if (active) setState({ status: "ready", records });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const records = state.status === "ready" ? state.records : [];
  const recordsByDate = useMemo(() => groupRecordsByDate(records), [records]);
  const todayRecords = recordsByDate.get(todayKey) ?? [];
  const selectedRecords = selectedDate ? recordsByDate.get(selectedDate) ?? [] : [];

  const handleDeleted = (recordId: string) => {
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            records: current.records.filter((record) => record.id !== recordId),
          }
        : current,
    );
  };

  if (selectedDate) {
    return (
      <FitnessDetail
        dateKey={selectedDate}
        records={selectedRecords}
        onBack={() => setSelectedDate(null)}
        onDeleted={handleDeleted}
      />
    );
  }

  return (
    <div className="fitness-screen">
      <main className="fitness-content" aria-label="体能训练记录">
        <section className="today-summary" aria-label="今日训练汇总">
          <Summary records={todayRecords} />
        </section>

        <section className="fitness-history" aria-labelledby="history-title">
          <div className="calendar-heading">
            <h2 id="history-title">训练日历</h2>
            <div>
              <button
                type="button"
                aria-label="上个月"
                onClick={() => changeMonth(-1)}
              >
                ‹
              </button>
              <p aria-live="polite">{MONTH_FORMATTER.format(month)}</p>
              <button
                type="button"
                aria-label="下个月"
                disabled={!canGoNextMonth}
                onClick={() => changeMonth(1)}
              >
                ›
              </button>
            </div>
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className="calendar-grid">
            {buildCalendar(month).map((date, index) => {
              if (!date) return <span className="calendar-blank" key={`blank-${index}`} />;
              const dateKey = toDateKey(date);
              const dayRecords = recordsByDate.get(dateKey) ?? [];
              const hasWorkout = dayRecords.length > 0;
              return (
                <button
                  className="calendar-day"
                  data-has-workout={hasWorkout ? "true" : "false"}
                  data-today={dateKey === todayKey ? "true" : "false"}
                  type="button"
                  disabled={!hasWorkout}
                  aria-label={`${date.getMonth() + 1}月${date.getDate()}日${hasWorkout ? `，${dayRecords.length}次训练，查看详情` : "，无训练"}`}
                  key={dateKey}
                  onClick={() => setSelectedDate(dateKey)}
                >
                  <span>{date.getDate()}</span>
                  {hasWorkout ? <i aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          <p className="calendar-hint">有荧光标记的日期可查看训练录像</p>
        </section>

        {state.status === "loading" ? <p className="fitness-status">正在读取训练记录…</p> : null}
        {state.status === "error" ? (
          <section className="fitness-status" role="alert">
            <p>记录读取失败。</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>重试</button>
          </section>
        ) : null}
      </main>

      <MainNav
        active="fitness"
        onNavigate={(destination) => {
          if (destination !== "fitness") onNavigate(destination);
        }}
      />
    </div>
  );
}

function FitnessDetail({
  dateKey,
  records,
  onBack,
  onDeleted,
}: {
  dateKey: string;
  records: WorkoutRecordMetadata[];
  onBack: () => void;
  onDeleted: (recordId: string) => void;
}) {
  const date = fromDateKey(dateKey);
  return (
    <main className="fitness-detail" aria-labelledby="fitness-detail-title">
      <header className="detail-header">
        <button type="button" aria-label="返回体能日历" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <div>
          <p>训练详情</p>
          <h1 id="fitness-detail-title">{DETAIL_DATE_FORMATTER.format(date)}</h1>
        </div>
      </header>

      <section className="detail-summary" aria-label="当日训练汇总">
        <Summary records={records} />
      </section>

      {records.length > 0 ? (
        <section className="detail-records" aria-label="当日训练录像">
          {records.map((record) => (
            <WorkoutRecord key={record.id} record={record} onDeleted={onDeleted} />
          ))}
        </section>
      ) : (
        <section className="detail-empty">
          <h2>这天的记录已清空</h2>
          <button type="button" onClick={onBack}>返回日历</button>
        </section>
      )}
    </main>
  );
}

function Summary({ records }: { records: WorkoutRecordMetadata[] }) {
  const reps = records.reduce((total, record) => total + record.completedReps, 0);
  const seconds = records.reduce((total, record) => total + record.durationSeconds, 0);
  return (
    <dl className="fitness-summary">
      <div><dt>训练</dt><dd>{records.length}<small>次</small></dd></div>
      <div><dt>完成</dt><dd>{reps}<small>次</small></dd></div>
      <div><dt>用时</dt><dd>{formatCompactDuration(seconds)}</dd></div>
    </dl>
  );
}

function WorkoutRecord({
  record,
  onDeleted,
}: {
  record: WorkoutRecordMetadata;
  onDeleted: (recordId: string) => void;
}) {
  const exercise = getExercise(record.exerciseId);
  const completedAt = new Date(record.completedAt);
  const [video, setVideo] = useState<VideoState>({ status: "loading" });
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "error">("idle");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void getWorkoutVideo(record.id)
      .then((blob) => {
        if (!active) return;
        if (!blob) {
          setVideo({ status: "missing" });
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setVideo({ status: "ready", url: objectUrl, blob });
      })
      .catch(() => {
        if (active) setVideo({ status: "error" });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record.id]);

  const exportVideo = async () => {
    if (video.status !== "ready") return;
    const mimeType = video.blob.type || record.mimeType;
    const extension = mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
    const fileName = `workout-${record.completedAt}.${extension}`;
    try {
      const file = new File([video.blob], fileName, { type: mimeType, lastModified: record.completedAt });
      const files = [file];
      if (navigator.share && navigator.canShare?.({ files })) {
        await navigator.share({ files, title: `${exercise.label}训练录像` });
        return;
      }
    } catch (error) {
      if (isAbortError(error)) return;
    }
    const link = document.createElement("a");
    link.href = video.url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  };

  const removeRecord = async () => {
    if (!window.confirm(`删除这条${exercise.label}记录和本机视频？删除后无法恢复。`)) return;
    setDeleteStatus("deleting");
    try {
      await deleteWorkoutRecord(record.id);
      onDeleted(record.id);
    } catch {
      setDeleteStatus("error");
    }
  };

  return (
    <article className="record-item">
      <header className="record-item__header">
        <div><h2>{exercise.label}</h2><time dateTime={completedAt.toISOString()}>{TIME_FORMATTER.format(completedAt)}</time></div>
        <strong>{record.completedReps}<small> / {record.targetReps} 次</small></strong>
      </header>
      <div className="record-video" aria-busy={video.status === "loading"}>
        {video.status === "ready" ? (
          <video src={video.url} controls playsInline preload="metadata" aria-label={`${exercise.label}训练录像`}>
            当前浏览器无法播放这段录像。
          </video>
        ) : null}
        {video.status === "loading" ? <p>正在读取录像…</p> : null}
        {video.status === "missing" ? <p>录像不存在。</p> : null}
        {video.status === "error" ? <p role="alert">录像读取失败。</p> : null}
      </div>
      <div className="record-item__summary">
        <p>用时 {formatDuration(record.durationSeconds)}</p>
        <div className="record-actions">
          <button className="record-export" type="button" disabled={video.status !== "ready" || deleteStatus === "deleting"} onClick={exportVideo}>导出</button>
          <button className="record-delete" type="button" disabled={deleteStatus === "deleting"} onClick={() => void removeRecord()}>{deleteStatus === "deleting" ? "删除中" : "删除"}</button>
        </div>
      </div>
      {deleteStatus === "error" ? <p className="record-delete-error" role="alert">删除失败，请重试。</p> : null}
    </article>
  );
}

function groupRecordsByDate(records: readonly WorkoutRecordMetadata[]) {
  const groups = new Map<string, WorkoutRecordMetadata[]>();
  for (const record of records) {
    const key = toDateKey(new Date(record.completedAt));
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return groups;
}

function buildCalendar(month: Date): Array<Date | null> {
  const first = startOfMonth(month);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function toDateKey(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatCompactDuration(seconds: number) {
  if (seconds < 60) return <>{seconds}<small>秒</small></>;
  const minutes = Math.floor(seconds / 60);
  return <>{minutes}<small>分 {seconds % 60 ? `${seconds % 60}秒` : ""}</small></>;
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
