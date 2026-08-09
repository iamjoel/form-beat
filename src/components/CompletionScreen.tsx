import { EXERCISES, type ExerciseId } from "../domain/exercises";
import { formatDuration, type CompletionStats } from "../domain/session";

interface CompletionScreenProps {
  exerciseId: ExerciseId;
  stats: CompletionStats;
  recordingNotice: string;
  recordingSaving: boolean;
  onRepeat: () => void;
  onOpenRecords: () => void;
}

export function CompletionScreen({
  exerciseId,
  stats,
  recordingNotice,
  recordingSaving,
  onRepeat,
  onOpenRecords,
}: CompletionScreenProps) {
  const exercise = EXERCISES.find((item) => item.id === exerciseId) ?? EXERCISES[0];
  const reachedTarget = stats.completedReps >= stats.targetReps;

  return (
    <main className="completion-screen" aria-labelledby="completion-title">
      <section className="completion-content" aria-live="polite">
        <span className="completion-mark" aria-hidden="true">✓</span>
        <p>{exercise.label}</p>
        <h1 id="completion-title">{reachedTarget ? "完成" : "训练结束"}</h1>
        <div className="completion-count" aria-label={`完成 ${stats.completedReps} 次，目标 ${stats.targetReps} 次`}>
          <strong>{stats.completedReps}</strong>
          <span>/ {stats.targetReps} 次</span>
        </div>
        <p className="completion-time">用时 {formatDuration(stats.durationSeconds)}</p>
        {recordingNotice ? (
          <p className="completion-recording" role="status" aria-live="polite">
            {recordingNotice}
          </p>
        ) : null}
      </section>

      <div className="completion-actions">
        <button className="repeat-button" type="button" onClick={onRepeat}>
          再来一组
        </button>
        <button
          className="new-workout-button"
          type="button"
          disabled={recordingSaving}
          onClick={onOpenRecords}
        >
          {recordingSaving ? "正在保存" : "查看记录"}
        </button>
      </div>
    </main>
  );
}
