import { useEffect, useRef, useState } from "react";
import {
  getExercise,
  type ExerciseId,
} from "@workout-detect/core/domain/exercises";
import {
  EXERCISE_DEMO_SPRITE_CROPS,
  getExerciseDemoCriticalMarkup,
  getExerciseDemoFrame,
  getExerciseDemoKeyframe,
  type ExerciseDemoFrame,
} from "@workout-detect/core/lib/exercise-demo";
import type { PosePoint } from "@workout-detect/core/lib/geometry";
import type { PoseAngleOverlay } from "@workout-detect/core/lib/rep-counter";
import huskySpriteUrl from "@workout-detect/core/assets/husky-exercise-sprites-v2.png";

interface ExerciseDemoScreenProps {
  exerciseId: ExerciseId;
  onBack: () => void;
  onStart: (skipNextTime: boolean) => void;
}

interface CanvasPoint {
  x: number;
  y: number;
}

const DEMO_DURATION_MS = 2_800;

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

function drawHuskySprite(
  context: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  exerciseId: ExerciseId,
  keyframe: 0 | 1,
  width: number,
  height: number,
): void {
  const sourceWidth = sprite.naturalWidth / 2;
  const crop = EXERCISE_DEMO_SPRITE_CROPS[exerciseId];
  const sourceY = crop.sourceY * sprite.naturalHeight;
  const sourceHeight = Math.min(
    crop.sourceHeight * sprite.naturalHeight,
    sprite.naturalHeight - sourceY,
  );
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (crop.mirror) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    sprite,
    keyframe * sourceWidth,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height,
  );
  context.restore();
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
  frame: ExerciseDemoFrame,
  sprite: HTMLImageElement | null,
  exerciseId: ExerciseId,
  keyframe: 0 | 1,
  width: number,
  height: number,
): void {
  const unit = Math.min(width, height);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#e9eadf";
  context.fillRect(0, 0, width, height);

  if (sprite) {
    drawHuskySprite(context, sprite, exerciseId, keyframe, width, height);
  }
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  const criticalMarkup = getExerciseDemoCriticalMarkup(frame.angleOverlays);
  for (const [startIndex, endIndex] of criticalMarkup.segments) {
    const start = canvasPoint(frame.landmarks, startIndex, width, height);
    const end = canvasPoint(frame.landmarks, endIndex, width, height);
    if (!start || !end) continue;
    drawLine(context, [start, end], "rgb(14 15 13 / 82%)", unit * 0.024);
    drawLine(context, [start, end], "#c8ef3f", unit * 0.011);
  }

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

  for (const overlay of frame.angleOverlays) {
    drawAngleOverlay(context, frame.landmarks, overlay, width, height);
  }
  context.restore();
}

function useExerciseDemoCanvas(exerciseId: ExerciseId) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    const sprite = new Image();
    let loadedSprite: HTMLImageElement | null = null;
    let animationFrame = 0;
    sprite.decoding = "async";
    sprite.onload = () => {
      loadedSprite = sprite;
    };
    sprite.src = huskySpriteUrl;

    const render = (timestamp: number) => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
      const pixelHeight = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const progress = reduceMotion ? 0.5 : (timestamp - startedAt) / DEMO_DURATION_MS;
      const keyframe = getExerciseDemoKeyframe(progress);
      drawDemo(
        context,
        getExerciseDemoFrame(exerciseId, keyframe === 0 ? 0 : 0.5),
        loadedSprite,
        exerciseId,
        keyframe,
        bounds.width,
        bounds.height,
      );
      if (!reduceMotion) animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrame);
  }, [exerciseId]);

  return canvasRef;
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
  const canvasRef = useExerciseDemoCanvas(exerciseId);

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
          <canvas
            ref={canvasRef}
            className="demo-canvas"
            role="img"
            aria-label={`哈士奇正在演示${exercise.label}，画面标有训练时使用的骨骼点和关键角度`}
          />
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
