import {
  EXERCISE_DEMO_SPRITE_CROPS,
  getExerciseDemoCriticalMarkup,
  type ExerciseDemoFrame,
} from "../shared/core/lib/exercise-demo";
import type { ExerciseId } from "../shared/core/domain/exercises";
import type { PosePoint } from "../shared/core/lib/geometry";
import type { PoseAngleOverlay } from "../shared/core/lib/rep-counter";

export interface DemoRenderSize {
  width: number;
  height: number;
}

export type DemoSpriteImage = HTMLImageElement;

interface CanvasPoint {
  x: number;
  y: number;
}

function canvasPoint(
  landmarks: readonly PosePoint[],
  index: number,
  size: DemoRenderSize,
): CanvasPoint | null {
  const point = landmarks[index];
  if (!point || (point.visibility ?? 0) < 0.5) return null;
  return { x: point.x * size.width, y: point.y * size.height };
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
  sprite: DemoSpriteImage,
  exerciseId: ExerciseId,
  keyframe: 0 | 1,
  size: DemoRenderSize,
): void {
  const sourceWidth = sprite.width / 2;
  const crop = EXERCISE_DEMO_SPRITE_CROPS[exerciseId];
  const sourceY = crop.sourceY * sprite.height;
  const sourceHeight = Math.min(
    crop.sourceHeight * sprite.height,
    sprite.height - sourceY,
  );
  context.save();
  context.imageSmoothingEnabled = true;
  if (crop.mirror) {
    context.translate(size.width, 0);
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
    size.width,
    size.height,
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
  size: DemoRenderSize,
): void {
  const start = canvasPoint(landmarks, overlay.startIndex, size);
  const vertex = canvasPoint(landmarks, overlay.vertexIndex, size);
  const end = canvasPoint(landmarks, overlay.endIndex, size);
  if (!start || !vertex || !end) return;

  const unit = Math.min(size.width, size.height);
  const startAngle = Math.atan2(start.y - vertex.y, start.x - vertex.x);
  const endAngle = Math.atan2(end.y - vertex.y, end.x - vertex.x);
  const sweep = shortestAngleSweep(startAngle, endAngle);
  const radius = unit * 0.045;
  context.beginPath();
  context.arc(vertex.x, vertex.y, radius, startAngle, startAngle + sweep, sweep < 0);
  context.lineWidth = unit * 0.018;
  context.strokeStyle = "rgba(14, 15, 13, 0.86)";
  context.stroke();
  context.lineWidth = unit * 0.008;
  context.strokeStyle = "#c8ef3f";
  context.stroke();

  const fontSize = Math.max(15, unit * 0.047);
  const label = `${Math.round(overlay.degrees)}°`;
  const angle = startAngle + sweep / 2;
  const labelX = vertex.x + Math.cos(angle) * (radius + fontSize * 1.15);
  const labelY = vertex.y + Math.sin(angle) * (radius + fontSize * 1.15);
  context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const labelWidth = context.measureText(label).width + fontSize * 0.8;
  context.fillStyle = "rgba(14, 15, 13, 0.9)";
  context.fillRect(
    labelX - labelWidth / 2,
    labelY - fontSize * 0.72,
    labelWidth,
    fontSize * 1.44,
  );
  context.fillStyle = "#f7f7f2";
  context.fillText(label, labelX, labelY + 1);
}

export function drawExerciseDemo(
  context: CanvasRenderingContext2D,
  frame: ExerciseDemoFrame,
  size: DemoRenderSize,
  sprite: DemoSpriteImage | null,
  exerciseId: ExerciseId,
  keyframe: 0 | 1,
): void {
  const unit = Math.min(size.width, size.height);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = "#e9eadf";
  context.fillRect(0, 0, size.width, size.height);
  if (sprite) {
    drawHuskySprite(context, sprite, exerciseId, keyframe, size);
  }
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  const criticalMarkup = getExerciseDemoCriticalMarkup(frame.angleOverlays);
  for (const [startIndex, endIndex] of criticalMarkup.segments) {
    const start = canvasPoint(frame.landmarks, startIndex, size);
    const end = canvasPoint(frame.landmarks, endIndex, size);
    if (!start || !end) continue;
    drawLine(context, [start, end], "rgba(14, 15, 13, 0.82)", unit * 0.024);
    drawLine(context, [start, end], "#c8ef3f", unit * 0.011);
  }
  for (const pointIndex of criticalMarkup.pointIndices) {
    const point = frame.landmarks[pointIndex];
    if (!point || (point.visibility ?? 0) < 0.5) continue;
    context.beginPath();
    context.arc(point.x * size.width, point.y * size.height, unit * 0.014, 0, Math.PI * 2);
    context.fillStyle = "#c8ef3f";
    context.fill();
    context.lineWidth = unit * 0.006;
    context.strokeStyle = "rgba(14, 15, 13, 0.9)";
    context.stroke();
  }
  for (const overlay of frame.angleOverlays) {
    drawAngleOverlay(context, frame.landmarks, overlay, size);
  }
  context.restore();
}
