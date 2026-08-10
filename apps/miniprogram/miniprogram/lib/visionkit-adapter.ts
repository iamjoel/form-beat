import type { PosePoint } from "../shared/core/lib/geometry";

/**
 * VisionKit's official 23-point body layout uses the subject's left side on
 * the right side of the preview. Map the joints used by the shared counter to
 * their MediaPipe-compatible indices so the exercise rules stay platform-free.
 */
const VISIONKIT_TO_POSE = [
  [0, 0],
  [1, 2],
  [2, 5],
  [3, 7],
  [4, 8],
  [5, 11],
  [6, 12],
  [7, 13],
  [8, 14],
  [9, 15],
  [10, 16],
  [11, 23],
  [12, 24],
  [13, 25],
  [14, 26],
  [15, 27],
  [16, 28],
  [19, 29],
  [20, 30],
  [21, 31],
  [22, 32],
] as const;

const EMPTY_POINT: PosePoint = { x: 0, y: 0, visibility: 0 };

export function visionKitBodyToPose(anchor: VKBodyAnchor): PosePoint[] {
  const landmarks = Array.from({ length: 33 }, () => ({ ...EMPTY_POINT }));

  for (const [visionKitIndex, poseIndex] of VISIONKIT_TO_POSE) {
    const point = anchor.points[visionKitIndex];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;

    const confidence = anchor.confidence[visionKitIndex] ?? anchor.score ?? 0;
    landmarks[poseIndex] = {
      x: point.x,
      y: point.y,
      visibility: Math.min(1, Math.max(0, confidence)),
    };
  }

  return landmarks;
}

export function smoothPose(
  previous: readonly PosePoint[] | null,
  current: readonly PosePoint[],
  alpha = 0.42,
): PosePoint[] {
  if (!previous || previous.length !== current.length) {
    return current.map((point) => ({ ...point }));
  }

  return current.map((point, index) => {
    const before = previous[index];
    if ((point.visibility ?? 0) <= 0 || (before.visibility ?? 0) <= 0) {
      return { ...point };
    }
    return {
      x: before.x + (point.x - before.x) * alpha,
      y: before.y + (point.y - before.y) * alpha,
      visibility: point.visibility,
    };
  });
}
