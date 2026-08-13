import type { CatalogExerciseId } from "../domain/exercise-catalog";
import { jointAngle, type FrameSize, type PosePoint } from "./geometry";
import type { PoseAngleOverlay } from "./rep-counter";

export type MotionEasing = "linear" | "ease-in-out" | "ease-out";
export type BoneConnection = [startIndex: number, endIndex: number];

export interface PoseKeyframe {
  id: string;
  name: string;
  timeMs: number;
  referenceFrame: 0 | 1;
  points: PosePoint[];
}

export interface AngleAnnotation {
  id: string;
  label: string;
  startIndex: number;
  vertexIndex: number;
  endIndex: number;
  radius: number;
  labelOffset: { x: number; y: number };
}

/**
 * Character rendering is deliberately separate from pose interpolation.
 * Existing projects use a two-frame sprite sheet; a layered renderer can use
 * the same pose points without changing the motion data format.
 */
export type MotionCharacter =
  | {
      renderer: "sprite-frames";
      assetId: "husky-exercise-sprites-v2" | string;
    }
  | {
      renderer: "layered-rig";
      assetId: string;
    };

export interface MotionProject {
  schemaVersion: 1;
  name: string;
  durationMs: number;
  easing: MotionEasing;
  loop: boolean;
  canvas: { width: number; height: number };
  reference: {
    exerciseId: CatalogExerciseId;
    visible: boolean;
    opacity: number;
  };
  character?: MotionCharacter;
  display: {
    skeleton: boolean;
    joints: boolean;
    angles: boolean;
  };
  skeleton: {
    connections: BoneConnection[];
  };
  keyframes: PoseKeyframe[];
  annotations: AngleAnnotation[];
}

export interface MotionPoseSegment {
  previous: PoseKeyframe;
  next: PoseKeyframe;
  progress: number;
}

export interface MotionFrame {
  landmarks: readonly PosePoint[];
  angleOverlays: readonly PoseAngleOverlay[];
  referenceFrame: 0 | 1;
  timeMs: number;
}

export function applyMotionEasing(progress: number, easing: MotionEasing): number {
  const value = Math.min(1, Math.max(0, progress));
  if (easing === "linear") return value;
  if (easing === "ease-out") return 1 - (1 - value) ** 4;
  return value < 0.5
    ? 8 * value ** 4
    : 1 - (-2 * value + 2) ** 4 / 2;
}

export function sortMotionKeyframes(
  keyframes: readonly PoseKeyframe[],
): PoseKeyframe[] {
  return [...keyframes].sort((a, b) => a.timeMs - b.timeMs);
}

export function getMotionPoseSegment(
  keyframes: readonly PoseKeyframe[],
  timeMs: number,
): MotionPoseSegment {
  const frames = sortMotionKeyframes(keyframes);
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) throw new Error("项目中至少需要一个关键帧");
  if (timeMs <= first.timeMs) return { previous: first, next: first, progress: 0 };
  if (timeMs >= last.timeMs) return { previous: last, next: last, progress: 0 };

  for (let index = 0; index < frames.length - 1; index += 1) {
    const previous = frames[index];
    const next = frames[index + 1];
    if (timeMs <= next.timeMs) {
      return {
        previous,
        next,
        progress:
          (timeMs - previous.timeMs) /
          Math.max(1, next.timeMs - previous.timeMs),
      };
    }
  }

  return { previous: last, next: last, progress: 0 };
}

export function normalizeMotionTime(
  project: Pick<MotionProject, "durationMs" | "loop">,
  elapsedMs: number,
): number {
  if (!Number.isFinite(elapsedMs)) return 0;
  const durationMs = Math.max(1, project.durationMs);
  if (!project.loop) return Math.min(durationMs, Math.max(0, elapsedMs));
  return ((elapsedMs % durationMs) + durationMs) % durationMs;
}

export function interpolateMotionPose(
  project: Pick<MotionProject, "keyframes" | "easing">,
  timeMs: number,
): PosePoint[] {
  const segment = getMotionPoseSegment(project.keyframes, timeMs);
  const amount = applyMotionEasing(segment.progress, project.easing);
  return segment.previous.points.map((point, index) => {
    const next = segment.next.points[index] ?? point;
    const visible =
      (point.visibility ?? 0) >= 0.5 || (next.visibility ?? 0) >= 0.5;
    return {
      x: point.x + (next.x - point.x) * amount,
      y: point.y + (next.y - point.y) * amount,
      z: (point.z ?? 0) + ((next.z ?? 0) - (point.z ?? 0)) * amount,
      visibility: visible ? 1 : 0,
    };
  });
}

export function getMotionReferenceFrame(
  project: Pick<MotionProject, "keyframes">,
  timeMs: number,
): 0 | 1 {
  const segment = getMotionPoseSegment(project.keyframes, timeMs);
  return segment.progress < 0.5
    ? segment.previous.referenceFrame
    : segment.next.referenceFrame;
}

export function getMotionAngleOverlays(
  annotations: readonly AngleAnnotation[],
  landmarks: readonly PosePoint[],
  size: FrameSize,
): PoseAngleOverlay[] {
  const overlays: PoseAngleOverlay[] = [];
  for (const annotation of annotations) {
    const start = landmarks[annotation.startIndex];
    const vertex = landmarks[annotation.vertexIndex];
    const end = landmarks[annotation.endIndex];
    if (
      !start ||
      !vertex ||
      !end ||
      (start.visibility ?? 0) < 0.5 ||
      (vertex.visibility ?? 0) < 0.5 ||
      (end.visibility ?? 0) < 0.5
    ) continue;
    overlays.push({
      id: annotation.id,
      startIndex: annotation.startIndex,
      vertexIndex: annotation.vertexIndex,
      endIndex: annotation.endIndex,
      degrees: Math.round(jointAngle(start, vertex, end, size)),
    });
  }
  return overlays;
}

export function getMotionFrame(
  project: MotionProject,
  elapsedMs: number,
  size: FrameSize = project.canvas,
): MotionFrame {
  const timeMs = normalizeMotionTime(project, elapsedMs);
  const landmarks = interpolateMotionPose(project, timeMs);
  return {
    landmarks,
    angleOverlays: getMotionAngleOverlays(project.annotations, landmarks, size),
    referenceFrame: getMotionReferenceFrame(project, timeMs),
    timeMs,
  };
}
