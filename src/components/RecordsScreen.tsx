import { useEffect, useState } from "react";

import type { WorkoutRecordMetadata } from "../domain/records";
import { formatDuration } from "../domain/session";
import { getExercise } from "../domain/exercises";
import {
  getWorkoutVideo,
  listWorkoutRecords,
} from "../lib/workout-record-store";
import { MainNav, type MainNavDestination } from "./MainNav";

interface RecordsScreenProps {
  onHome: () => void;
}

type RecordsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; records: WorkoutRecordMetadata[] };

type VideoState =
  | { status: "loading" }
  | { status: "missing" | "error" }
  | { status: "ready"; url: string; blob: Blob };

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function RecordsScreen({ onHome }: RecordsScreenProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<RecordsState>({ status: "loading" });

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

  const handleNavigate = (destination: MainNavDestination) => {
    if (destination === "home") onHome();
  };

  return (
    <div className="records-screen">
      <main className="records-content" aria-labelledby="records-title">
        <header className="records-header">
          <h1 id="records-title">记录</h1>
          <span>仅存储在本机</span>
        </header>

        {state.status === "loading" ? (
          <p className="records-status" role="status">
            正在读取记录…
          </p>
        ) : null}

        {state.status === "error" ? (
          <section className="records-status" role="alert">
            <p>记录读取失败。</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
              重试
            </button>
          </section>
        ) : null}

        {state.status === "ready" && state.records.length === 0 ? (
          <section className="records-status records-status--empty">
            <h2>还没有记录</h2>
            <p>完成一组训练后会显示在这里。</p>
            <button type="button" onClick={onHome}>
              开始训练
            </button>
          </section>
        ) : null}

        {state.status === "ready" && state.records.length > 0 ? (
          <section className="records-list" aria-label="训练记录列表">
            {state.records.map((record) => (
              <WorkoutRecord key={record.id} record={record} />
            ))}
          </section>
        ) : null}
      </main>

      <MainNav active="records" onNavigate={handleNavigate} />
    </div>
  );
}

function WorkoutRecord({ record }: { record: WorkoutRecordMetadata }) {
  const exercise = getExercise(record.exerciseId);
  const completedAt = new Date(record.completedAt);
  const formattedDate = DATE_FORMATTER.format(completedAt);
  const [video, setVideo] = useState<VideoState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setVideo({ status: "loading" });

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
      const file = new File([video.blob], fileName, {
        type: mimeType,
        lastModified: record.completedAt,
      });
      const files = [file];

      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files })
      ) {
        await navigator.share({
          files,
          title: `${exercise.label}训练录像`,
        });
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

  return (
    <article className="record-item">
      <header className="record-item__header">
        <h2>{exercise.label}</h2>
        <time dateTime={completedAt.toISOString()}>{formattedDate}</time>
      </header>

      <div className="record-video" aria-busy={video.status === "loading"}>
        {video.status === "ready" ? (
          <video
            src={video.url}
            controls
            playsInline
            preload="metadata"
            aria-label={`${exercise.label}训练录像，录制于${formattedDate}`}
          >
            当前浏览器无法播放这段录像。
          </video>
        ) : null}
        {video.status === "loading" ? <p>正在读取录像…</p> : null}
        {video.status === "missing" ? <p>录像不存在。</p> : null}
        {video.status === "error" ? <p role="alert">录像读取失败。</p> : null}
      </div>

      <div className="record-item__summary">
        <dl>
          <div>
            <dt>次数</dt>
            <dd>
              {record.completedReps} / {record.targetReps} 次
            </dd>
          </div>
          <div>
            <dt>用时</dt>
            <dd>{formatDuration(record.durationSeconds)}</dd>
          </div>
        </dl>
        <button
          className="record-export"
          type="button"
          disabled={video.status !== "ready"}
          onClick={exportVideo}
        >
          导出视频
        </button>
      </div>
    </article>
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
