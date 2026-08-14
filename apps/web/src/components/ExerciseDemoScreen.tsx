import { useEffect, useRef, useState } from "react";
import {
  getExerciseCatalogEntry,
  type CatalogExerciseId,
} from "@workout-detect/core/domain/exercise-catalog";
import {
  getExercise,
  type ExerciseId,
} from "@workout-detect/core/domain/exercises";
import {
  EXERCISE_DEMO_SPRITE_CROPS,
  getExerciseDemoCriticalMarkup,
  getExerciseDemoSpriteCenter,
  type HuskySpriteAssetId,
} from "@workout-detect/core/lib/exercise-demo";
import { getExerciseDemoProject } from "@workout-detect/core/lib/exercise-demo-project";
import type { PosePoint } from "@workout-detect/core/lib/geometry";
import {
  getMotionFrame,
  type MotionFrame,
  type MotionProject,
} from "@workout-detect/core/lib/motion-project";
import type { PoseAngleOverlay } from "@workout-detect/core/lib/rep-counter";
import huskySpriteUrl from "@workout-detect/core/assets/husky-exercise-sprites-v2.png";
import huskySpriteV3Url from "@workout-detect/core/assets/husky-exercise-sprites-v3.png";
import {
  createHuskySpriteRenderer,
  type DemoCharacterRenderer,
} from "../lib/demo-character-renderer";

const DEMO_SPRITE_URLS: Record<HuskySpriteAssetId, string> = {
  "husky-exercise-sprites-v2": huskySpriteUrl,
  "husky-exercise-sprites-v3": huskySpriteV3Url,
};

type DemoLoadStatus = "loading" | "ready" | "error";

interface ExerciseDemoScreenProps {
  exerciseId: ExerciseId;
  onBack: () => void;
  onStart: (skipNextTime: boolean) => void;
}

interface CanvasPoint {
  x: number;
  y: number;
}

function canvasPoint(
  landmarks: readonly PosePoint[],
  index: number,
  width: number,
  height: number,
): CanvasPoint | null {
  const point = landmarks[index];
  if (!point || (point.visibility ?? 0) < 0.5) return null;
  return { x: point.x * width, y: point.y * height };
}

function drawLine(
  context: CanvasRenderingContext2D,
  points: readonly (CanvasPoint | null)[],
  color: string,
  lineWidth: number,
): void {
  const visiblePoints = points.filter((point): point is CanvasPoint => point !== null);
  if (visiblePoints.length < 2) return;
  context.beginPath();
  context.moveTo(visiblePoints[0].x, visiblePoints[0].y);
  for (const point of visiblePoints.slice(1)) context.lineTo(point.x, point.y);
  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.stroke();
}

function shortestAngleSweep(start: number, end: number): number {
  let sweep = end - start;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  return sweep;
}

function drawAngleOverlay(
  context: CanvasRenderingContext2D,
  landmarks: readonly PosePoint[],
  overlay: PoseAngleOverlay,
  width: number,
  height: number,
): void {
  const start = canvasPoint(landmarks, overlay.startIndex, width, height);
  const vertex = canvasPoint(landmarks, overlay.vertexIndex, width, height);
  const end = canvasPoint(landmarks, overlay.endIndex, width, height);
  if (!start || !vertex || !end) return;

  const unit = Math.min(width, height);
  const startAngle = Math.atan2(start.y - vertex.y, start.x - vertex.x);
  const endAngle = Math.atan2(end.y - vertex.y, end.x - vertex.x);
  const sweep = shortestAngleSweep(startAngle, endAngle);
  const radius = unit * 0.045;
  context.beginPath();
  context.arc(vertex.x, vertex.y, radius, startAngle, startAngle + sweep, sweep < 0);
  context.lineWidth = unit * 0.018;
  context.strokeStyle = "rgb(14 15 13 / 86%)";
  context.stroke();
  context.lineWidth = unit * 0.008;
  context.strokeStyle = "#c8ef3f";
  context.stroke();

  const fontSize = Math.max(15, unit * 0.047);
  const label = `${Math.round(overlay.degrees)}°`;
  const angle = startAngle + sweep / 2;
  const labelX = vertex.x + Math.cos(angle) * (radius + fontSize * 1.15);
  const labelY = vertex.y + Math.sin(angle) * (radius + fontSize * 1.15);
  context.font = `750 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const labelWidth = context.measureText(label).width + fontSize * 0.8;
  context.fillStyle = "rgb(14 15 13 / 90%)";
  context.beginPath();
  context.roundRect(
    labelX - labelWidth / 2,
    labelY - fontSize * 0.72,
    labelWidth,
    fontSize * 1.44,
    fontSize,
  );
  context.fill();
  context.fillStyle = "#f7f7f2";
  context.fillText(label, labelX, labelY + 1);
}

function drawDemo(
  context: CanvasRenderingContext2D,
  project: MotionProject,
  frame: MotionFrame,
  characterRenderer: DemoCharacterRenderer | null,
  width: number,
  height: number,
): void {
  const unit = Math.min(width, height);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f8f5ed";
  context.fillRect(0, 0, width, height);

  const contentCenter = getExerciseDemoSpriteCenter(
    project.reference.exerciseId,
    frame.referenceFrame,
  );
  context.save();
  context.translate(
    (0.5 - contentCenter.x) * width,
    (0.5 - contentCenter.y) * height,
  );
  if (project.reference.visible && characterRenderer) {
    characterRenderer.draw(context, project, frame, width, height);
  }
  context.lineCap = "round";
  context.lineJoin = "round";
  const criticalMarkup = getExerciseDemoCriticalMarkup(frame.angleOverlays);
  if (project.display.skeleton) {
    for (const [startIndex, endIndex] of criticalMarkup.segments) {
      const start = canvasPoint(frame.landmarks, startIndex, width, height);
      const end = canvasPoint(frame.landmarks, endIndex, width, height);
      if (!start || !end) continue;
      drawLine(context, [start, end], "rgb(14 15 13 / 82%)", unit * 0.024);
      drawLine(context, [start, end], "#c8ef3f", unit * 0.011);
    }
  }

  if (project.display.joints) {
    for (const pointIndex of criticalMarkup.pointIndices) {
      const point = frame.landmarks[pointIndex];
      if (!point || (point.visibility ?? 0) < 0.5) continue;
      context.beginPath();
      context.arc(point.x * width, point.y * height, unit * 0.014, 0, Math.PI * 2);
      context.fillStyle = "#e65d43";
      context.fill();
      context.lineWidth = unit * 0.006;
      context.strokeStyle = "#f7f7f2";
      context.stroke();
    }
  }

  if (project.display.angles) {
    for (const overlay of frame.angleOverlays) {
      drawAngleOverlay(context, frame.landmarks, overlay, width, height);
    }
  }
  context.restore();
}

function useExerciseDemoCanvas(exerciseId: CatalogExerciseId) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadState, setLoadState] = useState<{
    exerciseId: CatalogExerciseId;
    status: DemoLoadStatus;
  }>({ exerciseId, status: "loading" });

  useEffect(() => {
    setLoadState({ exerciseId, status: "loading" });
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    if (!context) {
      setLoadState({ exerciseId, status: "error" });
      return undefined;
    }
    const project = getExerciseDemoProject(exerciseId);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    let disposed = false;
    let sprite: HTMLImageElement | null = null;
    let startedAt = 0;

    const render = (
      timestamp: number,
      characterRenderer: DemoCharacterRenderer | null,
    ) => {
      if (disposed) return;
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
      const pixelHeight = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const elapsedMs = reduceMotion
        ? project.durationMs / 2
        : timestamp - startedAt;
      drawDemo(
        context,
        project,
        getMotionFrame(project, elapsedMs),
        characterRenderer,
        bounds.width,
        bounds.height,
      );
      if (!reduceMotion) {
        animationFrame = requestAnimationFrame((nextTimestamp) => {
          render(nextTimestamp, characterRenderer);
        });
      }
    };

    const startRendering = (characterRenderer: DemoCharacterRenderer | null) => {
      if (disposed) return;
      startedAt = performance.now();
      render(startedAt, characterRenderer);
      if (!disposed) setLoadState({ exerciseId, status: "ready" });
    };

    if (!project.reference.visible) {
      startRendering(null);
    } else {
      const assetId = EXERCISE_DEMO_SPRITE_CROPS[project.reference.exerciseId].assetId;
      sprite = new Image();
      sprite.decoding = "async";
      sprite.onload = () => {
        if (disposed || !sprite) return;
        const characterRenderer = createHuskySpriteRenderer({ [assetId]: sprite });
        startRendering(characterRenderer);
      };
      sprite.onerror = () => {
        if (!disposed) setLoadState({ exerciseId, status: "error" });
      };
      sprite.src = DEMO_SPRITE_URLS[assetId];
    }

    return () => {
      disposed = true;
      if (sprite) {
        sprite.onload = null;
        sprite.onerror = null;
      }
      cancelAnimationFrame(animationFrame);
    };
  }, [exerciseId]);

  return {
    canvasRef,
    status: loadState.exerciseId === exerciseId ? loadState.status : "loading",
  };
}

export function ExerciseDemoCanvas({
  exerciseId,
  className = "demo-canvas",
}: {
  exerciseId: CatalogExerciseId;
  className?: string;
}) {
  const { canvasRef, status } = useExerciseDemoCanvas(exerciseId);
  const exercise = getExerciseCatalogEntry(exerciseId);
  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        role="img"
        aria-hidden={status !== "ready"}
        aria-label={`哈士奇正在演示${exercise.label}`}
      />
      {status === "ready" ? null : (
        <div
          className="exercise-demo-status"
          role="status"
          aria-live="polite"
        >
          {status === "loading" ? (
            <span className="loading-spinner" aria-hidden="true" />
          ) : null}
          <p>{status === "loading" ? "正在准备动作演示" : "动作演示加载失败"}</p>
        </div>
      )}
    </>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function ExerciseDemoScreen({
  exerciseId,
  onBack,
  onStart,
}: ExerciseDemoScreenProps) {
  const exercise = getExercise(exerciseId);
  const [skipNextTime, setSkipNextTime] = useState(false);

  return (
    <main className="demo-screen">
      <header className="demo-header">
        <button type="button" onClick={onBack} aria-label="返回训练设置">
          <BackIcon />
        </button>
        <div>
          <p>动作演示</p>
          <h1>{exercise.label}</h1>
        </div>
        <span aria-hidden="true" />
      </header>

      <section className="demo-content" aria-label={`${exercise.label}动作演示`}>
        <div className="demo-canvas-frame">
          <ExerciseDemoCanvas exerciseId={exerciseId} />
        </div>

        <label className="demo-skip">
          <input
            type="checkbox"
            checked={skipNextTime}
            onChange={(event) => setSkipNextTime(event.currentTarget.checked)}
          />
          <span aria-hidden="true" />
          不再提示
        </label>
      </section>

      <footer className="demo-footer">
        <button type="button" onClick={() => onStart(skipNextTime)}>
          开始训练
        </button>
      </footer>
    </main>
  );
}
