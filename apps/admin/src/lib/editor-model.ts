import type { ExerciseId } from "@workout-detect/core/domain/exercises";
import {
  getExerciseDemoFrame,
  POSE_CONNECTIONS,
  type ExerciseDemoFrame,
} from "@workout-detect/core/lib/exercise-demo";
import type { PosePoint } from "@workout-detect/core/lib/geometry";
import {
  applyMotionEasing,
  getMotionPoseSegment,
  getMotionReferenceFrame,
  interpolateMotionPose,
  sortMotionKeyframes,
  type AngleAnnotation,
  type BoneConnection,
  type MotionProject,
  type PoseKeyframe,
} from "@workout-detect/core/lib/motion-project";

export type {
  AngleAnnotation,
  BoneConnection,
  MotionEasing,
  MotionProject,
  MotionPoseSegment as PoseSegment,
  PoseKeyframe,
} from "@workout-detect/core/lib/motion-project";

export interface JointDefinition {
  index: number;
  label: string;
  shortLabel: string;
}

export interface AnglePreset {
  id: string;
  label: string;
  joints: readonly [number, number, number];
}

export const JOINTS: readonly JointDefinition[] = [
  { index: 0, label: "头部", shortLabel: "头" },
  { index: 7, label: "左耳", shortLabel: "左耳" },
  { index: 8, label: "右耳", shortLabel: "右耳" },
  { index: 11, label: "左肩", shortLabel: "左肩" },
  { index: 12, label: "右肩", shortLabel: "右肩" },
  { index: 13, label: "左肘", shortLabel: "左肘" },
  { index: 14, label: "右肘", shortLabel: "右肘" },
  { index: 15, label: "左腕", shortLabel: "左腕" },
  { index: 16, label: "右腕", shortLabel: "右腕" },
  { index: 23, label: "左髋", shortLabel: "左髋" },
  { index: 24, label: "右髋", shortLabel: "右髋" },
  { index: 25, label: "左膝", shortLabel: "左膝" },
  { index: 26, label: "右膝", shortLabel: "右膝" },
  { index: 27, label: "左踝", shortLabel: "左踝" },
  { index: 28, label: "右踝", shortLabel: "右踝" },
  { index: 29, label: "左脚跟", shortLabel: "左跟" },
  { index: 30, label: "右脚跟", shortLabel: "右跟" },
  { index: 31, label: "左脚尖", shortLabel: "左尖" },
  { index: 32, label: "右脚尖", shortLabel: "右尖" },
] as const;

export const JOINT_BY_INDEX = new Map(JOINTS.map((joint) => [joint.index, joint]));

export const ANGLE_PRESETS: readonly AnglePreset[] = [
  { id: "left-elbow", label: "左肘角", joints: [11, 13, 15] },
  { id: "right-elbow", label: "右肘角", joints: [12, 14, 16] },
  { id: "left-hip", label: "左髋角", joints: [11, 23, 25] },
  { id: "right-hip", label: "右髋角", joints: [12, 24, 26] },
  { id: "left-knee", label: "左膝角", joints: [23, 25, 27] },
  { id: "right-knee", label: "右膝角", joints: [24, 26, 28] },
  { id: "left-ankle", label: "左踝角", joints: [25, 27, 31] },
  { id: "right-ankle", label: "右踝角", joints: [26, 28, 32] },
] as const;

export const DEFAULT_BONE_CONNECTIONS: readonly BoneConnection[] =
  POSE_CONNECTIONS.map(([startIndex, endIndex]) => [startIndex, endIndex]);

export function connectionKey(connection: readonly [number, number]): string {
  const [startIndex, endIndex] = connection;
  return startIndex < endIndex
    ? `${startIndex}:${endIndex}`
    : `${endIndex}:${startIndex}`;
}

export function cloneConnections(
  connections: readonly (readonly [number, number])[],
): BoneConnection[] {
  return connections.map(([startIndex, endIndex]) => [startIndex, endIndex]);
}

export function connectedJointIndices(
  connections: readonly (readonly [number, number])[],
): Set<number> {
  const indices = new Set<number>();
  for (const [startIndex, endIndex] of connections) {
    indices.add(startIndex);
    indices.add(endIndex);
  }
  return indices;
}

export function removedDefaultConnections(
  connections: readonly (readonly [number, number])[],
): BoneConnection[] {
  const activeKeys = new Set(connections.map(connectionKey));
  return DEFAULT_BONE_CONNECTIONS
    .filter((connection) => !activeKeys.has(connectionKey(connection)))
    .map(([startIndex, endIndex]) => [startIndex, endIndex]);
}

export function findRestorableConnection(
  selectedJointIndices: readonly number[],
  activeConnections: readonly (readonly [number, number])[],
): BoneConnection | null {
  if (
    selectedJointIndices.length !== 2 ||
    selectedJointIndices[0] === selectedJointIndices[1]
  ) return null;
  const selectedKey = connectionKey([
    selectedJointIndices[0],
    selectedJointIndices[1],
  ]);
  if (activeConnections.some((connection) => connectionKey(connection) === selectedKey)) {
    return null;
  }
  const original = DEFAULT_BONE_CONNECTIONS.find(
    (connection) => connectionKey(connection) === selectedKey,
  );
  return original ? [...original] : null;
}

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function clonePoints(points: readonly PosePoint[]): PosePoint[] {
  return points.map((point) => ({ ...point }));
}

function keyframeFromFrame(
  frame: ExerciseDemoFrame,
  name: string,
  timeMs: number,
  referenceFrame: 0 | 1,
): PoseKeyframe {
  return {
    id: createId("keyframe"),
    name,
    timeMs,
    referenceFrame,
    points: clonePoints(frame.landmarks),
  };
}

function annotationsFromFrame(frame: ExerciseDemoFrame): AngleAnnotation[] {
  return frame.angleOverlays.slice(0, 3).map((overlay, index) => ({
    id: createId("angle"),
    label: `角度 ${index + 1}`,
    startIndex: overlay.startIndex,
    vertexIndex: overlay.vertexIndex,
    endIndex: overlay.endIndex,
    radius: 0.055,
    labelOffset: { x: 0, y: 0 },
  }));
}

export function createMotionProject(exerciseId: ExerciseId = "squat"): MotionProject {
  const start = getExerciseDemoFrame(exerciseId, 0);
  const end = getExerciseDemoFrame(exerciseId, 0.5);
  const durationMs = 2_800;

  return {
    schemaVersion: 1,
    name: `${exerciseId}-motion`,
    durationMs,
    easing: "ease-in-out",
    loop: true,
    canvas: { width: 720, height: 720 },
    reference: { exerciseId, visible: true, opacity: 0.94 },
    character: {
      renderer: "sprite-frames",
      assetId: "husky-exercise-sprites-v2",
    },
    display: { skeleton: true, joints: true, angles: true },
    skeleton: { connections: cloneConnections(DEFAULT_BONE_CONNECTIONS) },
    keyframes: [
      keyframeFromFrame(start, "起始", 0, 0),
      keyframeFromFrame(end, "发力", durationMs / 2, 1),
      keyframeFromFrame(start, "回位", durationMs, 0),
    ],
    annotations: annotationsFromFrame(end),
  };
}

export const applyEasing = applyMotionEasing;
export const sortedKeyframes = sortMotionKeyframes;
export const getPoseSegment = getMotionPoseSegment;
export const interpolatePose = interpolateMotionPose;
export const referenceFrameAt = getMotionReferenceFrame;

export function nearestKeyframe(
  project: MotionProject,
  timeMs: number,
): PoseKeyframe {
  return project.keyframes.reduce((nearest, frame) =>
    Math.abs(frame.timeMs - timeMs) < Math.abs(nearest.timeMs - timeMs)
      ? frame
      : nearest,
  );
}

export function addKeyframeAt(project: MotionProject, timeMs: number): PoseKeyframe {
  const referenceFrame = referenceFrameAt(project, timeMs);
  return {
    id: createId("keyframe"),
    name: `姿势 ${project.keyframes.length + 1}`,
    timeMs: Math.round(timeMs),
    referenceFrame,
    points: interpolatePose(project, timeMs),
  };
}

export function createAnnotation(preset: AnglePreset): AngleAnnotation {
  return {
    id: createId("angle"),
    label: preset.label,
    startIndex: preset.joints[0],
    vertexIndex: preset.joints[1],
    endIndex: preset.joints[2],
    radius: 0.055,
    labelOffset: { x: 0, y: 0 },
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseMotionProject(value: unknown): MotionProject {
  if (!value || typeof value !== "object") throw new Error("文件不是有效的动作项目");
  const project = value as Partial<MotionProject>;
  if (project.schemaVersion !== 1) throw new Error("不支持的项目版本");
  if (!isFiniteNumber(project.durationMs) || project.durationMs < 100) {
    throw new Error("动作时长无效");
  }
  if (!Array.isArray(project.keyframes) || project.keyframes.length === 0) {
    throw new Error("项目中没有关键帧");
  }
  for (const frame of project.keyframes) {
    if (!frame || !isFiniteNumber(frame.timeMs) || !Array.isArray(frame.points)) {
      throw new Error("关键帧数据无效");
    }
    if (frame.points.length !== 33) throw new Error("关键帧必须包含 33 个姿态点");
  }
  if (!project.reference || !project.display || !project.canvas) {
    throw new Error("项目显示配置不完整");
  }
  const skeleton = project.skeleton ?? {
    connections: cloneConnections(DEFAULT_BONE_CONNECTIONS),
  };
  if (!Array.isArray(skeleton.connections)) throw new Error("骨骼连线数据无效");
  for (const connection of skeleton.connections) {
    if (
      !Array.isArray(connection) ||
      connection.length !== 2 ||
      !Number.isInteger(connection[0]) ||
      !Number.isInteger(connection[1])
    ) {
      throw new Error("骨骼连线数据无效");
    }
  }
  return {
    ...(value as Omit<MotionProject, "skeleton">),
    skeleton: { connections: cloneConnections(skeleton.connections) },
  };
}
