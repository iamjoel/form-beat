import type { PosePoint } from "../shared/core/lib/geometry";
import type { PoseAngleOverlay } from "../shared/core/lib/rep-counter";

export interface RenderSize {
  width: number;
  height: number;
}

export interface CoverLayout {
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
}

const CONNECTIONS: readonly [number, number][] = [
  [0, 11],
  [0, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
];

function visible(point: PosePoint | undefined): point is PosePoint {
  return Boolean(
    point &&
      (point.visibility ?? 1) >= 0.5 &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y),
  );
}

export function getCoverLayout(
  source: RenderSize,
  display: RenderSize,
): CoverLayout {
  const scale = Math.max(
    display.width / Math.max(1, source.width),
    display.height / Math.max(1, source.height),
  );
  const renderedWidth = source.width * scale;
  const renderedHeight = source.height * scale;

  return {
    renderedWidth,
    renderedHeight,
    offsetX: (display.width - renderedWidth) / 2,
    offsetY: (display.height - renderedHeight) / 2,
  };
}

function createProjector(source: RenderSize, display: RenderSize) {
  const { renderedWidth, renderedHeight, offsetX, offsetY } = getCoverLayout(
    source,
    display,
  );

  return (point: PosePoint) => ({
    // The CameraFrame preview is mirrored with the same cover transform.
    x: display.width - (point.x * renderedWidth + offsetX),
    y: point.y * renderedHeight + offsetY,
  });
}

export function clearPose(
  context: CanvasRenderingContext2D,
  display: RenderSize,
): void {
  context.clearRect(0, 0, display.width, display.height);
}

export function drawPose(
  context: CanvasRenderingContext2D,
  source: RenderSize,
  display: RenderSize,
  landmarks: readonly PosePoint[],
  angleOverlays: readonly PoseAngleOverlay[],
): void {
  clearPose(context, display);
  const project = createProjector(source, display);
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const [startIndex, endIndex] of CONNECTIONS) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    if (!visible(start) || !visible(end)) continue;
    const a = project(start);
    const b = project(end);

    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.lineWidth = 8;
    context.strokeStyle = "rgba(18, 20, 15, 0.82)";
    context.stroke();
    context.lineWidth = 4;
    context.strokeStyle = "#c7fa38";
    context.stroke();
  }

  for (const point of landmarks) {
    if (!visible(point)) continue;
    const position = project(point);
    context.beginPath();
    context.arc(position.x, position.y, 6, 0, Math.PI * 2);
    context.fillStyle = "#c7fa38";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "rgba(18, 20, 15, 0.88)";
    context.stroke();
  }

  context.font = "700 16px -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const overlay of angleOverlays) {
    const vertex = landmarks[overlay.vertexIndex];
    if (!visible(vertex)) continue;
    const position = project(vertex);
    const label = `${Math.round(overlay.degrees)}°`;
    const width = context.measureText(label).width + 18;
    context.fillStyle = "rgba(18, 20, 15, 0.88)";
    context.fillRect(position.x - width / 2, position.y - 34, width, 26);
    context.fillStyle = "#f7f5ef";
    context.fillText(label, position.x, position.y - 21);
  }

  context.restore();
}
