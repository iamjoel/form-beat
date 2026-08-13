import { useState } from "react";
import {
  EXERCISE_CATALOG,
  MUSCLE_GROUPS,
  getExerciseCatalogEntry,
  getMuscleGroup,
  type CatalogExerciseId,
  type MuscleGroupId,
} from "@workout-detect/core/domain/exercise-catalog";
import type { ExerciseId } from "@workout-detect/core/domain/exercises";

import { ExerciseDemoCanvas } from "./ExerciseDemoScreen";
import { MainNav, type MainNavDestination } from "./MainNav";

type MuscleFilter = "all" | MuscleGroupId;

interface ExerciseLibraryScreenProps {
  onNavigate: (destination: Exclude<MainNavDestination, "exercises">) => void;
  onStartExercise: (exerciseId: ExerciseId) => void;
}

export function ExerciseLibraryScreen({
  onNavigate,
  onStartExercise,
}: ExerciseLibraryScreenProps) {
  const [muscleFilter, setMuscleFilter] = useState<MuscleFilter>("all");
  const [activeExerciseId, setActiveExerciseId] = useState<CatalogExerciseId | null>(null);

  if (activeExerciseId) {
    const trainingExerciseId = getExerciseCatalogEntry(
      activeExerciseId,
    ).trainingExerciseId;
    return (
      <ExerciseDetail
        exerciseId={activeExerciseId}
        onBack={() => {
          setActiveExerciseId(null);
          window.scrollTo({ top: 0, left: 0 });
        }}
        onStart={trainingExerciseId
          ? () => onStartExercise(trainingExerciseId)
          : undefined}
      />
    );
  }

  const visibleExercises = muscleFilter === "all"
    ? EXERCISE_CATALOG
    : EXERCISE_CATALOG.filter((exercise) =>
        exercise.primaryMuscleGroup === muscleFilter);

  return (
    <div className="exercise-library-screen">
      <main className="exercise-library-content" aria-labelledby="exercise-library-title">
        <header className="exercise-library-header">
          <div>
            <h1 id="exercise-library-title">动作</h1>
            <p>按七大肌群找到自重动作</p>
          </div>
          <span>{EXERCISE_CATALOG.length} 个自重动作</span>
        </header>

        <div className="muscle-filter-wrap">
          <div className="muscle-filter" role="group" aria-label="按肌群筛选动作">
            <button
              type="button"
              data-active={muscleFilter === "all" ? "true" : "false"}
              aria-pressed={muscleFilter === "all"}
              onClick={() => setMuscleFilter("all")}
            >
              全部
            </button>
            {MUSCLE_GROUPS.map((group) => (
              <button
                type="button"
                data-active={muscleFilter === group.id ? "true" : "false"}
                aria-pressed={muscleFilter === group.id}
                key={group.id}
                onClick={() => setMuscleFilter(group.id)}
              >
                {group.label}
              </button>
            ))}
          </div>
        </div>

        {muscleFilter === "all" ? null : (
          <p className="muscle-filter-focus">{getMuscleGroup(muscleFilter).focus}</p>
        )}

        {visibleExercises.length > 0 ? (
          <section className="exercise-catalog-list" aria-label="动作列表">
            {visibleExercises.map((entry, index) => {
              const primaryGroup = getMuscleGroup(entry.primaryMuscleGroup);
              return (
                <button
                  className="exercise-catalog-row"
                  type="button"
                  key={entry.id}
                  onClick={() => {
                    setActiveExerciseId(entry.id);
                    window.scrollTo({ top: 0, left: 0 });
                  }}
                >
                  <span className="exercise-catalog-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="exercise-catalog-copy">
                    <strong>{entry.label}</strong>
                    <small>{entry.difficulty} · {entry.equipment} · {primaryGroup.label}</small>
                  </span>
                  <span className="exercise-catalog-arrow" aria-hidden="true">→</span>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="exercise-catalog-empty">
            <span aria-hidden="true">—</span>
            <h2>这组动作正在校准</h2>
            <p>先从其他肌群开始，完成识别测试后会在这里出现。</p>
          </section>
        )}
      </main>

      <MainNav
        active="exercises"
        onNavigate={(destination) => {
          if (destination !== "exercises") onNavigate(destination);
        }}
      />
    </div>
  );
}

function ExerciseDetail({
  exerciseId,
  onBack,
  onStart,
}: {
  exerciseId: CatalogExerciseId;
  onBack: () => void;
  onStart?: () => void;
}) {
  const entry = getExerciseCatalogEntry(exerciseId);

  return (
    <main className="exercise-detail" aria-labelledby="exercise-detail-title">
      <header className="exercise-detail-header">
        <button type="button" aria-label="返回动作列表" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <div>
          <p>{entry.difficulty} · {entry.equipment}</p>
          <h1 id="exercise-detail-title">{entry.label}</h1>
        </div>
      </header>

      <section className="exercise-detail-demo" aria-label={`${entry.label}动作演示`}>
        <div className="exercise-detail-demo-frame">
          <ExerciseDemoCanvas exerciseId={exerciseId} className="exercise-detail-canvas" />
        </div>
        <span>哈士奇示范</span>
      </section>

      <section className="exercise-detail-intro">
        <div className="exercise-muscle-tags" aria-label="参与肌群">
          {entry.muscleGroups.map((groupId) => (
            <span key={groupId}>{getMuscleGroup(groupId).label}</span>
          ))}
        </div>
        <p>{entry.summary}</p>
      </section>

      <section className="exercise-detail-steps" aria-labelledby="exercise-steps-title">
        <h2 id="exercise-steps-title">怎么做</h2>
        <ol>
          {entry.steps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="exercise-detail-cues" aria-labelledby="exercise-cues-title">
        <h2 id="exercise-cues-title">动作要点</h2>
        <ul>
          {entry.cues.map((cue) => <li key={cue}>{cue}</li>)}
        </ul>
      </section>

      <footer className="exercise-detail-action">
        {onStart ? (
          <button type="button" onClick={onStart}>用这个动作开始训练</button>
        ) : (
          <button type="button" disabled>动作识别即将开放</button>
        )}
      </footer>
    </main>
  );
}
