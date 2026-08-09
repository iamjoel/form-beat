import type { ExerciseId } from "../domain/exercises";
import { getExercise } from "../domain/exercises";
import type { AvatarId } from "../domain/records";
import type { CompletionStats } from "../domain/session";
import { usePoseTrainer } from "../hooks/usePoseTrainer";
import type { CompletedRecording } from "../lib/session-recorder";

interface WorkoutScreenProps {
  exerciseId: ExerciseId;
  target: number;
  avatar: AvatarId;
  onExit: () => void;
  onComplete: (
    stats: CompletionStats,
    recording: CompletedRecording | null,
  ) => void | Promise<void>;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SoundIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 10v4h4l4 3V7l-4 3H5Z" />
      {enabled ? (
        <>
          <path d="M16 9c.8.8 1.2 1.8 1.2 3S16.8 14.2 16 15" />
          <path d="M18.5 6.5a7.8 7.8 0 0 1 0 11" />
        </>
      ) : (
        <path d="m16 9 5 6m0-6-5 6" />
      )}
    </svg>
  );
}

function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paused ? (
        <path className="play-path" d="m9 7 8 5-8 5V7Z" />
      ) : (
        <path d="M8 7v10m8-10v10" />
      )}
    </svg>
  );
}

function formatZoom(value: number): string {
  return `${Number(value.toFixed(1))}×`;
}

export function WorkoutScreen({
  exerciseId,
  target,
  avatar,
  onExit,
  onComplete,
}: WorkoutScreenProps) {
  const exercise = getExercise(exerciseId);
  const trainer = usePoseTrainer({ exerciseId, target, avatar, onComplete });
  const isTracking = trainer.status === "tracking";
  const trackingReady = isTracking && !trainer.paused && trainer.poseVisible;

  const statusLabel = (() => {
    if (trainer.status === "error") return "无法开始";
    if (trainer.status === "requesting-camera") return "请允许使用相机";
    if (trainer.status === "loading-model") {
      return `正在加载 ${trainer.modelProgress}%`;
    }
    if (!isTracking) return "正在准备";
    if (trainer.paused) return "已暂停，不会计数";
    return trainer.feedback;
  })();

  return (
    <main
      className="workout-screen"
      data-status={trainer.status}
      data-paused={trainer.paused ? "true" : "false"}
    >
      <header className="workout-topbar">
        <button
          className="workout-stop icon-control"
          type="button"
          onClick={onExit}
          aria-label="结束训练并返回"
        >
          <CloseIcon />
        </button>

        <strong className="workout-title">{exercise.label}</strong>

        <button
          className="icon-control"
          type="button"
          onClick={trainer.toggleSound}
          aria-label={trainer.soundEnabled ? "关闭声音" : "打开声音"}
          aria-pressed={trainer.soundEnabled}
        >
          <SoundIcon enabled={trainer.soundEnabled} />
        </button>
      </header>

      <section
        className="workout-camera"
        data-tracking-ready={trackingReady ? "true" : "false"}
        aria-label="实时姿态识别画面"
      >
        <video
          ref={trainer.videoRef}
          className="workout-video"
          muted
          playsInline
          autoPlay
          aria-label="前置摄像头镜像画面"
        />
        <canvas
          ref={trainer.canvasRef}
          className="workout-skeleton"
          aria-hidden="true"
        />

        <div className="workout-overlay">
          <div
            className="workout-message"
            data-visible={trackingReady ? "true" : "false"}
            role="status"
            aria-live="polite"
          >
            <span className="status-pulse" aria-hidden="true" />
            <p>{statusLabel}</p>
          </div>

          <div
            className="workout-counter"
            aria-label={`已完成 ${trainer.count} 次，目标 ${target} 次`}
            aria-live="polite"
            aria-atomic="true"
          >
            <strong>{trainer.count}</strong>
            <span>/ {target}</span>
          </div>

          {trainer.cameraZoomRange ? (
            <label className="workout-zoom">
              <span className="sr-only">摄像头变焦</span>
              <span className="zoom-limit" aria-hidden="true">
                {formatZoom(trainer.cameraZoomRange.max)}
              </span>
              <input
                type="range"
                min={trainer.cameraZoomRange.min}
                max={trainer.cameraZoomRange.max}
                step={trainer.cameraZoomRange.step}
                value={trainer.cameraZoom}
                onChange={(event) =>
                  trainer.setCameraZoom(event.currentTarget.valueAsNumber)
                }
                disabled={!isTracking}
                aria-label="摄像头变焦"
                aria-orientation="vertical"
                aria-valuetext={formatZoom(trainer.cameraZoom)}
              />
              <span className="zoom-limit" aria-hidden="true">
                {formatZoom(trainer.cameraZoomRange.min)}
              </span>
              <output aria-hidden="true">{formatZoom(trainer.cameraZoom)}</output>
            </label>
          ) : null}

          {trainer.status !== "tracking" && trainer.status !== "error" ? (
            <div className="workout-loading" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <strong>
                {trainer.status === "requesting-camera" ? "允许使用相机" : statusLabel}
              </strong>
              <p>
                {trainer.status === "requesting-camera"
                  ? "画面仅在本机处理"
                  : "首次加载需要几秒"}
              </p>
            </div>
          ) : null}

          {trainer.error ? (
            <div className="workout-error" role="alert">
              <h1>无法开始</h1>
              <p>{trainer.error}</p>
              <div className="error-actions">
                <button type="button" onClick={trainer.retry}>
                  重试
                </button>
                <button type="button" onClick={onExit}>
                  返回
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="workout-controls">
        <button
          className="workout-pause"
          type="button"
          onClick={trainer.togglePaused}
          disabled={!isTracking}
          aria-pressed={trainer.paused}
        >
          <PauseIcon paused={trainer.paused} />
          {trainer.paused ? "继续" : "暂停"}
        </button>
      </footer>
    </main>
  );
}
