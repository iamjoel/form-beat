import type { PosePoint } from "../shared/core/lib/geometry";
import type { PoseAngleOverlay } from "../shared/core/lib/rep-counter";
import { POSE_CONNECTIONS } from "../shared/core/lib/exercise-demo";

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

export type RecordingAvatarId = "none" | "man" | "woman";

export interface RecordingAvatarMask {
  avatar: Exclude<RecordingAvatarId, "none">;
  centerX: number;
  centerY: number;
  radius: number;
}

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

export function getRecordingAvatarMask(
  source: RenderSize,
  display: RenderSize,
  landmarks: readonly PosePoint[],
  avatar: RecordingAvatarId,
): RecordingAvatarMask | null {
  if (avatar === "none") return null;
  const facePoints = [landmarks[0], landmarks[7], landmarks[8]].filter(visible);
  // Only record frames with a complete, current face lock. Anything less risks
  // placing the privacy mask beside the face instead of over it.
  if (facePoints.length < 3) return null;

  const project = createProjector(source, display);
  const projectedFace = facePoints.map(project);
  const centerX =
    projectedFace.reduce((sum, point) => sum + point.x, 0) / projectedFace.length;
  const centerY =
    projectedFace.reduce((sum, point) => sum + point.y, 0) / projectedFace.length;
  const faceSpan = Math.max(
    ...projectedFace.flatMap((point, index) =>
      projectedFace.slice(index + 1).map((other) =>
        Math.hypot(point.x - other.x, point.y - other.y),
      ),
    ),
  );
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const shoulderWidth =
    visible(leftShoulder) && visible(rightShoulder)
      ? Math.hypot(
          project(leftShoulder).x - project(rightShoulder).x,
          project(leftShoulder).y - project(rightShoulder).y,
        )
      : display.width * 0.24;
  const diameter = Math.min(
    display.width * 0.44,
    Math.max(display.width * 0.2, shoulderWidth * 0.86, faceSpan * 1.9),
  );

  return { avatar, centerX, centerY, radius: diameter / 2 };
}

function drawRecordingAvatar(
  context: CanvasRenderingContext2D,
  mask: RecordingAvatarMask,
): void {
  context.save();
  context.beginPath();
  context.arc(mask.centerX, mask.centerY, mask.radius, 0, Math.PI * 2);
  context.fillStyle = "rgba(247, 247, 242, 1)";
  context.fill();
  context.lineWidth = Math.max(3, mask.radius * 0.06);
  context.strokeStyle = "rgba(23, 24, 19, 1)";
  context.stroke();
  context.font = `${mask.radius * 1.42}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(
    mask.avatar === "man" ? "👨" : "👩",
    mask.centerX,
    mask.centerY + mask.radius * 0.05,
  );
  context.restore();
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
  recordingAvatar: RecordingAvatarId = "none",
): void {
  clearPose(context, display);
  const project = createProjector(source, display);
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
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

  const avatarMask = getRecordingAvatarMask(
    source,
    display,
    landmarks,
    recordingAvatar,
  );
  if (avatarMask) drawRecordingAvatar(context, avatarMask);

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
