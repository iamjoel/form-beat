import type { ChangeEvent } from "react";
import { EXERCISES, type ExerciseId } from "@workout-detect/core/domain/exercises";

import type { AvatarId } from "../domain/records";
import { MainNav } from "./MainNav";

interface SetupScreenProps {
  exerciseId: ExerciseId;
  target: number;
  avatar: AvatarId;
  onExerciseChange: (exerciseId: ExerciseId) => void;
  onTargetChange: (target: number) => void;
  onAvatarChange: (avatar: AvatarId) => void;
  onOpenRecords: () => void;
  onStart: () => void;
}

const AVATARS = [
  { id: "none", label: "无", emoji: null },
  { id: "man", label: "男", emoji: "👨" },
  { id: "woman", label: "女", emoji: "👩" },
] as const satisfies readonly {
  id: AvatarId;
  label: string;
  emoji: string | null;
}[];

const MIN_TARGET = 1;
const MAX_TARGET = 99;

export function SetupScreen({
  exerciseId,
  target,
  avatar,
  onExerciseChange,
  onTargetChange,
  onAvatarChange,
  onOpenRecords,
  onStart,
}: SetupScreenProps) {
  const selectedExercise =
    EXERCISES.find((exercise) => exercise.id === exerciseId) ?? EXERCISES[0];

  const setSafeTarget = (nextTarget: number) => {
    if (!Number.isFinite(nextTarget)) return;
    onTargetChange(Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(nextTarget))));
  };

  const handleTargetInput = (event: ChangeEvent<HTMLInputElement>) => {
    setSafeTarget(event.currentTarget.valueAsNumber);
  };

  return (
    <main className="setup-screen">
      <header className="setup-header">
        <h1>训练</h1>
      </header>

      <div className="setup-content">
        <section className="setup-section" aria-labelledby="exercise-heading">
          <h2 id="exercise-heading">动作</h2>
          <div className="exercise-options" role="radiogroup" aria-label="选择运动动作">
            {EXERCISES.map((exercise) => {
              const isSelected = exercise.id === exerciseId;

              return (
                <button
                  className="exercise-option"
                  data-selected={isSelected ? "true" : "false"}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-describedby={isSelected ? "selected-exercise-hint" : undefined}
                  key={exercise.id}
                  onClick={() => onExerciseChange(exercise.id)}
                >
                  <strong>{exercise.label}</strong>
                </button>
              );
            })}
          </div>
          <p id="selected-exercise-hint" className="sr-only">
            当前已选择{selectedExercise.label}
          </p>
        </section>

        <section className="setup-section" aria-labelledby="avatar-heading">
          <h2 id="avatar-heading">录屏头像</h2>
          <div className="avatar-options" role="radiogroup" aria-label="选择录屏头像">
            {AVATARS.map((option) => (
              <button
                className="avatar-option"
                data-selected={avatar === option.id ? "true" : "false"}
                type="button"
                role="radio"
                aria-checked={avatar === option.id}
                aria-label={option.id === "none" ? "不使用头像" : `${option.label}性 Emoji 头像`}
                key={option.id}
                onClick={() => onAvatarChange(option.id)}
              >
                {option.emoji ? <span aria-hidden="true">{option.emoji}</span> : null}
                <small>{option.label}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="setup-section" aria-labelledby="target-heading">
          <h2 id="target-heading">次数</h2>
          <div className="target-stepper">
            <button
              type="button"
              aria-label="减少一次"
              disabled={target <= MIN_TARGET}
              onClick={() => setSafeTarget(target - 1)}
            >
              −
            </button>
            <label>
              <span className="sr-only">目标次数</span>
              <span className="target-value">
                <input
                  type="number"
                  min={MIN_TARGET}
                  max={MAX_TARGET}
                  inputMode="numeric"
                  value={target}
                  onChange={handleTargetInput}
                />
                <span>次</span>
              </span>
            </label>
            <button
              type="button"
              aria-label="增加一次"
              disabled={target >= MAX_TARGET}
              onClick={() => setSafeTarget(target + 1)}
            >
              +
            </button>
          </div>
        </section>

        <p className="setup-hint">
          开始后允许相机，录屏仅存本机。{selectedExercise.cameraHint}
        </p>
      </div>

      <footer className="setup-footer">
        <button
          className="start-button"
          type="button"
          aria-label={`开始${selectedExercise.label}，目标${target}次`}
          onClick={onStart}
        >
          开始
        </button>
        <MainNav
          active="home"
          onNavigate={(nextView) => {
            if (nextView === "records") onOpenRecords();
          }}
        />
      </footer>
    </main>
  );
}
