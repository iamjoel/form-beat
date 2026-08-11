import { EXERCISE_DEMO_SPRITE_CROPS } from "@workout-detect/core/lib/exercise-demo";
import { jointAngle, type PosePoint } from "@workout-detect/core/lib/geometry";
import {
  interpolatePose,
  referenceFrameAt,
  connectedJointIndices,
  connectionKey,
  type AngleAnnotation,
  type BoneConnection,
  type MotionProject,
} from "./editor-model";

export interface RenderOptions {
  selectedJoint?: number | null;
  shiftSelectedJoints?: readonly number[];
  selectedAnnotationId?: string | null;
  selectedConnectionKey?: string | null;
  restoreCandidate?: BoneConnection | null;
  clean?: boolean;
}

export interface AngleGeometry {
  startAngle: number;
  sweep: number;
  radius: number;
  vertexX: number;
  vertexY: number;
  labelX: number;
  labelY: number;
  degrees: number;
}

function shortestSweep(start: number, end: number): number {
  let sweep = end - start;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  return sweep;
}

export function getAngleGeometry(
  annotation: AngleAnnotation,
  points: readonly PosePoint[],
  width: number,
  height: number,
): AngleGeometry | null {
  const start = points[annotation.startIndex];
  const vertex = points[annotation.vertexIndex];
  const end = points[annotation.endIndex];
  if (
    !start || !vertex || !end ||
    (start.visibility ?? 0) < 0.5 ||
    (vertex.visibility ?? 0) < 0.5 ||
    (end.visibility ?? 0) < 0.5
  ) return null;

  const startAngle = Math.atan2((start.y - vertex.y) * height, (start.x - vertex.x) * width);
  const endAngle = Math.atan2((end.y - vertex.y) * height, (end.x - vertex.x) * width);
  const sweep = shortestSweep(startAngle, endAngle);
  const radius = Math.min(width, height) * annotation.radius;
  const middle = startAngle + sweep / 2;
  const labelDistance = radius + Math.min(width, height) * 0.045;

  return {
    startAngle,
    sweep,
    radius,
    vertexX: vertex.x * width,
    vertexY: vertex.y * height,
    labelX: vertex.x * width + Math.cos(middle) * labelDistance + annotation.labelOffset.x * width,
    labelY: vertex.y * height + Math.sin(middle) * labelDistance + annotation.labelOffset.y * height,
    degrees: jointAngle(start, vertex, end, { width, height }),
  };
}

function drawReference(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  project: MotionProject,
  timeMs: number,
  sprite: CanvasImageSource,
  width: number,
  height: number,
): void {
  const crop = EXERCISE_DEMO_SPRITE_CROPS[project.reference.exerciseId];
  const imageWidth = "naturalWidth" in sprite
    ? (sprite as HTMLImageElement).naturalWidth
    : (sprite as { width: number }).width;
  const imageHeight = "naturalHeight" in sprite
    ? (sprite as HTMLImageElement).naturalHeight
    : (sprite as { height: number }).height;
  const sourceWidth = imageWidth / 2;
  const sourceY = crop.sourceY * imageHeight;
  const sourceHeight = Math.min(crop.sourceHeight * imageHeight, imageHeight - sourceY);
  const frame = referenceFrameAt(project, timeMs);

  context.save();
  context.globalAlpha = project.reference.opacity;
  context.imageSmoothingEnabled = true;
  if (crop.mirror) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    sprite,
    frame * sourceWidth,
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

function drawSkeleton(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: readonly PosePoint[],
  connections: readonly BoneConnection[],
  width: number,
  height: number,
  selectedConnectionKey: string | null,
  clean: boolean,
): void {
  const unit = Math.min(width, height);
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const connection of connections) {
    const [startIndex, endIndex] = connection;
    const start = points[startIndex];
    const end = points[endIndex];
    if (!start || !end || (start.visibility ?? 0) < 0.5 || (end.visibility ?? 0) < 0.5) continue;
    const selected = !clean && connectionKey(connection) === selectedConnectionKey;
    context.beginPath();
    context.moveTo(start.x * width, start.y * height);
    context.lineTo(end.x * width, end.y * height);
    context.lineWidth = unit * (selected ? 0.026 : 0.017);
    context.strokeStyle = selected ? "rgba(230, 93, 67, 0.96)" : "rgba(24, 25, 21, 0.84)";
    context.stroke();
    context.lineWidth = unit * 0.007;
    context.strokeStyle = selected ? "#f7f6ef" : "#c8ef3f";
    context.stroke();
  }
  context.restore();
}

function drawJoints(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: readonly PosePoint[],
  connections: readonly BoneConnection[],
  width: number,
  height: number,
  selectedJoint: number | null,
  shiftSelectedJoints: readonly number[],
  clean: boolean,
): void {
  const unit = Math.min(width, height);
  const connectedIndices = connectedJointIndices(connections);
  const shiftSelectedSet = new Set(shiftSelectedJoints);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point || (point.visibility ?? 0) < 0.5) continue;
    const isolated = !connectedIndices.has(index);
    if (isolated && clean) continue;
    const shiftSelected = shiftSelectedSet.has(index) && !clean;
    const selected = (index === selectedJoint || shiftSelected) && !clean;
    const radius = selected ? unit * 0.021 : unit * 0.013;
    if (selected) {
      context.beginPath();
      context.arc(point.x * width, point.y * height, unit * 0.032, 0, Math.PI * 2);
      context.fillStyle = "rgba(230, 93, 67, 0.2)";
      context.fill();
      if (shiftSelected) {
        context.beginPath();
        context.arc(point.x * width, point.y * height, unit * 0.027, 0, Math.PI * 2);
        context.lineWidth = unit * 0.005;
        context.strokeStyle = "#e65d43";
        context.stroke();
      }
    }
    context.beginPath();
    context.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
    if (isolated && !selected) {
      context.fillStyle = "rgba(247, 246, 239, 0.72)";
      context.fill();
      context.setLineDash([unit * 0.006, unit * 0.005]);
    } else {
      context.fillStyle = selected ? "#e65d43" : "#c8ef3f";
      context.fill();
    }
    context.lineWidth = unit * 0.005;
    context.strokeStyle = isolated && !selected ? "rgba(91, 93, 84, 0.62)" : "#181915";
    context.stroke();
    context.setLineDash([]);
  }
}

function drawRestoreCandidate(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: readonly PosePoint[],
  connection: BoneConnection,
  width: number,
  height: number,
): void {
  const start = points[connection[0]];
  const end = points[connection[1]];
  if (
    !start || !end ||
    (start.visibility ?? 0) < 0.5 ||
    (end.visibility ?? 0) < 0.5
  ) return;
  const unit = Math.min(width, height);
  context.save();
  context.lineCap = "round";
  context.setLineDash([unit * 0.018, unit * 0.012]);
  context.beginPath();
  context.moveTo(start.x * width, start.y * height);
  context.lineTo(end.x * width, end.y * height);
  context.lineWidth = unit * 0.012;
  context.strokeStyle = "rgba(247, 246, 239, 0.92)";
  context.stroke();
  context.lineDashOffset = unit * 0.004;
  context.lineWidth = unit * 0.006;
  context.strokeStyle = "#e65d43";
  context.stroke();
  context.restore();
}

function drawAngles(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  project: MotionProject,
  points: readonly PosePoint[],
  width: number,
  height: number,
  selectedAnnotationId: string | null,
  clean: boolean,
): void {
  const unit = Math.min(width, height);
  for (const annotation of project.annotations) {
    const geometry = getAngleGeometry(annotation, points, width, height);
    if (!geometry) continue;
    const selected = annotation.id === selectedAnnotationId && !clean;

    context.beginPath();
    context.arc(
      geometry.vertexX,
      geometry.vertexY,
      geometry.radius,
      geometry.startAngle,
      geometry.startAngle + geometry.sweep,
      geometry.sweep < 0,
    );
    context.lineWidth = unit * (selected ? 0.012 : 0.009);
    context.strokeStyle = selected ? "#e65d43" : "#181915";
    context.stroke();

    const fontSize = Math.max(13, unit * 0.035);
    const label = `${Math.round(geometry.degrees)}°`;
    context.font = `750 ${fontSize}px ui-rounded, "SF Pro Rounded", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const labelWidth = context.measureText(label).width + fontSize * 0.85;
    context.fillStyle = selected ? "#e65d43" : "rgba(24, 25, 21, 0.92)";
    context.beginPath();
    context.roundRect(
      geometry.labelX - labelWidth / 2,
      geometry.labelY - fontSize * 0.7,
      labelWidth,
      fontSize * 1.4,
      fontSize * 0.42,
    );
    context.fill();
    context.fillStyle = "#f7f6ef";
    context.fillText(label, geometry.labelX, geometry.labelY + 0.5);
  }
}

export function drawScene(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  project: MotionProject,
  timeMs: number,
  sprite: CanvasImageSource | null,
  width: number,
  height: number,
  options: RenderOptions = {},
): PosePoint[] {
  const points = interpolatePose(project, timeMs);
  const clean = options.clean ?? false;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#eeede5";
  context.fillRect(0, 0, width, height);

  if (project.reference.visible && sprite) {
    drawReference(context, project, timeMs, sprite, width, height);
  }
  if (project.display.skeleton) {
    drawSkeleton(
      context,
      points,
      project.skeleton.connections,
      width,
      height,
      options.selectedConnectionKey ?? null,
      clean,
    );
  }
  if (!clean && options.restoreCandidate) {
    drawRestoreCandidate(context, points, options.restoreCandidate, width, height);
  }
  if (project.display.joints) {
    drawJoints(
      context,
      points,
      project.skeleton.connections,
      width,
      height,
      options.selectedJoint ?? null,
      options.shiftSelectedJoints ?? [],
      clean,
    );
  }
  if (project.display.angles) {
    drawAngles(
      context,
      project,
      points,
      width,
      height,
      options.selectedAnnotationId ?? null,
      clean,
    );
  }

  return points;
}
