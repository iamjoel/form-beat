import type { ChangeEvent } from "react";
import { EXERCISES, type ExerciseId } from "@workout-detect/core/domain/exercises";

import { MainNav } from "./MainNav";

interface SetupScreenProps {
  exerciseId: ExerciseId;
  target: number;
  onExerciseChange: (exerciseId: ExerciseId) => void;
  onTargetChange: (target: number) => void;
  onOpenFitness: () => void;
  onOpenProfile: () => void;
  onStart: () => void;
}

const MIN_TARGET = 1;
const MAX_TARGET = 99;

export function SetupScreen({
  exerciseId,
  target,
  onExerciseChange,
  onTargetChange,
  onOpenFitness,
  onOpenProfile,
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
        <h1>锻炼</h1>
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
          active="workout"
          onNavigate={(nextView) => {
            if (nextView === "fitness") onOpenFitness();
            if (nextView === "profile") onOpenProfile();
          }}
        />
      </footer>
    </main>
  );
}
