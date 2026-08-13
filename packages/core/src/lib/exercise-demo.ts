import type { CatalogExerciseId } from "../domain/exercise-catalog";
import type { ExerciseId } from "../domain/exercises";
import type { PosePoint } from "./geometry";
import type { MotionProject } from "./motion-project";
import {
  classifyPose,
  type PoseAngleOverlay,
} from "./rep-counter";

export const POSE_CONNECTIONS = [
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
] as const satisfies readonly (readonly [number, number])[];

type DemoJoint = readonly [index: number, x: number, y: number];

interface DemoPosePair {
  start: readonly DemoJoint[];
  end: readonly DemoJoint[];
}

export interface ExerciseDemoFrame {
  landmarks: readonly PosePoint[];
  angleOverlays: readonly PoseAngleOverlay[];
}

export interface ExerciseDemoCriticalMarkup {
  segments: readonly (readonly [number, number])[];
  pointIndices: readonly number[];
}

export type HuskySpriteAssetId =
  | "husky-exercise-sprites-v2"
  | "husky-exercise-sprites-v3";

export interface ExerciseDemoSpriteCrop {
  assetId: HuskySpriteAssetId;
  sourceY: number;
  sourceHeight: number;
  mirror: boolean;
}

export const EXERCISE_DEMO_SPRITE_CROPS: Record<
  CatalogExerciseId,
  ExerciseDemoSpriteCrop
> = {
  squat: {
    assetId: "husky-exercise-sprites-v2",
    sourceY: 0,
    sourceHeight: 0.3,
    mirror: false,
  },
  "push-up": {
    assetId: "husky-exercise-sprites-v2",
    sourceY: 0.29,
    sourceHeight: 0.205,
    mirror: true,
  },
  "jumping-jack": {
    assetId: "husky-exercise-sprites-v2",
    sourceY: 0.485,
    sourceHeight: 0.25,
    mirror: false,
  },
  lunge: {
    assetId: "husky-exercise-sprites-v2",
    sourceY: 0.735,
    sourceHeight: 0.265,
    mirror: false,
  },
  superman: {
    assetId: "husky-exercise-sprites-v3",
    sourceY: 0,
    sourceHeight: 1 / 3,
    mirror: false,
  },
  "close-grip-push-up": {
    assetId: "husky-exercise-sprites-v3",
    sourceY: 1 / 3,
    sourceHeight: 1 / 3,
    mirror: false,
  },
  "mountain-climber": {
    assetId: "husky-exercise-sprites-v3",
    sourceY: 2 / 3,
    sourceHeight: 1 / 3,
    mirror: false,
  },
};

const SQUAT: DemoPosePair = {
  start: [
    [0, 0.59, 0.24], [7, 0.49, 0.08], [8, 0.54, 0.07],
    [11, 0.45, 0.35], [12, 0.51, 0.35],
    [13, 0.45, 0.49], [14, 0.52, 0.49],
    [15, 0.48, 0.64], [16, 0.55, 0.64],
    [23, 0.47, 0.58], [24, 0.52, 0.58],
    [25, 0.48, 0.75], [26, 0.53, 0.75],
    [27, 0.48, 0.91], [28, 0.54, 0.91],
    [29, 0.46, 0.91], [30, 0.52, 0.91],
    [31, 0.54, 0.92], [32, 0.6, 0.92],
  ],
  end: [
    [0, 0.59, 0.31], [7, 0.48, 0.18], [8, 0.53, 0.18],
    [11, 0.47, 0.43], [12, 0.53, 0.44],
    [13, 0.55, 0.52], [14, 0.59, 0.52],
    [15, 0.63, 0.42], [16, 0.65, 0.43],
    [23, 0.43, 0.59], [24, 0.49, 0.6],
    [25, 0.583, 0.7], [26, 0.6, 0.71],
    [27, 0.44, 0.9], [28, 0.52, 0.9],
    [29, 0.42, 0.91], [30, 0.5, 0.91],
    [31, 0.49, 0.92], [32, 0.58, 0.92],
  ],
};

const PUSH_UP: DemoPosePair = {
  start: [
    [0, 0.18, 0.31], [7, 0.22, 0.13], [8, 0.28, 0.16],
    [11, 0.32, 0.4], [12, 0.35, 0.43],
    [13, 0.33, 0.59], [14, 0.36, 0.62],
    [15, 0.34, 0.77], [16, 0.37, 0.8],
    [23, 0.6, 0.48], [24, 0.63, 0.51],
    [25, 0.72, 0.56], [26, 0.75, 0.59],
    [27, 0.84, 0.66], [28, 0.87, 0.69],
    [29, 0.83, 0.68], [30, 0.86, 0.71],
    [31, 0.9, 0.68], [32, 0.93, 0.71],
  ],
  end: [
    [0, 0.16, 0.61], [7, 0.2, 0.48], [8, 0.25, 0.49],
    [11, 0.33, 0.55], [12, 0.36, 0.58],
    [13, 0.445, 0.65], [14, 0.48, 0.68],
    [15, 0.34, 0.77], [16, 0.37, 0.8],
    [23, 0.61, 0.625], [24, 0.64, 0.64],
    [25, 0.73, 0.65], [26, 0.76, 0.68],
    [27, 0.85, 0.69], [28, 0.88, 0.72],
    [29, 0.84, 0.71], [30, 0.87, 0.74],
    [31, 0.91, 0.71], [32, 0.94, 0.74],
  ],
};

const JUMPING_JACK: DemoPosePair = {
  start: [
    [0, 0.5, 0.26], [7, 0.45, 0.1], [8, 0.55, 0.1],
    [11, 0.42, 0.34], [12, 0.58, 0.34],
    [13, 0.41, 0.52], [14, 0.59, 0.52],
    [15, 0.4, 0.64], [16, 0.6, 0.64],
    [23, 0.46, 0.56], [24, 0.54, 0.56],
    [25, 0.47, 0.74], [26, 0.53, 0.74],
    [27, 0.48, 0.91], [28, 0.52, 0.91],
    [29, 0.46, 0.91], [30, 0.5, 0.91],
    [31, 0.53, 0.92], [32, 0.57, 0.92],
  ],
  end: [
    [0, 0.39, 0.29], [7, 0.34, 0.1], [8, 0.42, 0.1],
    [11, 0.38, 0.35], [12, 0.49, 0.35],
    [13, 0.27, 0.2], [14, 0.56, 0.2],
    [15, 0.15, 0.1], [16, 0.605, 0.1],
    [23, 0.43, 0.57], [24, 0.51, 0.57],
    [25, 0.32, 0.75], [26, 0.62, 0.75],
    [27, 0.18, 0.92], [28, 0.68, 0.92],
    [29, 0.15, 0.93], [30, 0.65, 0.93],
    [31, 0.22, 0.94], [32, 0.72, 0.94],
  ],
};

const LUNGE: DemoPosePair = {
  start: [
    [0, 0.58, 0.25], [7, 0.48, 0.08], [8, 0.53, 0.07],
    [11, 0.45, 0.35], [12, 0.51, 0.35],
    [13, 0.45, 0.49], [14, 0.52, 0.49],
    [15, 0.48, 0.64], [16, 0.55, 0.64],
    [23, 0.47, 0.58], [24, 0.52, 0.58],
    [25, 0.46, 0.75], [26, 0.54, 0.75],
    [27, 0.46, 0.91], [28, 0.55, 0.91],
    [29, 0.44, 0.92], [30, 0.53, 0.92],
    [31, 0.51, 0.93], [32, 0.61, 0.93],
  ],
  end: [
    [0, 0.53, 0.27], [7, 0.37, 0.09], [8, 0.43, 0.08],
    [11, 0.38, 0.36], [12, 0.44, 0.37],
    [13, 0.3, 0.5], [14, 0.5, 0.49],
    [15, 0.38, 0.58], [16, 0.44, 0.58],
    [23, 0.345, 0.593], [24, 0.47, 0.57],
    [25, 0.352, 0.764], [26, 0.689, 0.7],
    [27, 0.143, 0.773], [28, 0.57, 0.9],
    [29, 0.09, 0.83], [30, 0.55, 0.91],
    [31, 0.16, 0.84], [32, 0.65, 0.92],
  ],
};

const SUPERMAN: DemoPosePair = {
  start: PUSH_UP.start,
  end: PUSH_UP.end,
};

const CLOSE_GRIP_PUSH_UP: DemoPosePair = {
  start: PUSH_UP.start,
  end: PUSH_UP.end,
};

const MOUNTAIN_CLIMBER: DemoPosePair = {
  start: PUSH_UP.start,
  end: PUSH_UP.end,
};

const DEMO_POSES: Record<CatalogExerciseId, DemoPosePair> = {
  squat: SQUAT,
  "push-up": PUSH_UP,
  "jumping-jack": JUMPING_JACK,
  lunge: LUNGE,
  superman: SUPERMAN,
  "close-grip-push-up": CLOSE_GRIP_PUSH_UP,
  "mountain-climber": MOUNTAIN_CLIMBER,
};

function buildLandmarks(joints: readonly DemoJoint[]): PosePoint[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    visibility: 0,
  }));
  for (const [index, x, y] of joints) {
    landmarks[index] = { x, y, visibility: 1 };
  }
  return landmarks;
}

function createBuiltInMotionProject(
  exerciseId: CatalogExerciseId,
  pose: DemoPosePair,
  classificationExerciseId?: ExerciseId,
): MotionProject {
  const durationMs = 2_800;
  const start = buildLandmarks(pose.start);
  const end = buildLandmarks(pose.end);
  const endClassification = classificationExerciseId
    ? classifyPose(classificationExerciseId, {
        landmarks: end,
        size: { width: 1_000, height: 1_000 },
        timestamp: durationMs / 2,
      })
    : null;
  const crop = EXERCISE_DEMO_SPRITE_CROPS[exerciseId];

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
      assetId: crop.assetId,
    },
    display: { skeleton: true, joints: true, angles: true },
    skeleton: {
      connections: POSE_CONNECTIONS.map(([startIndex, endIndex]) => [
        startIndex,
        endIndex,
      ]),
    },
    keyframes: [
      {
        id: `${exerciseId}-start`,
        name: "起始",
        timeMs: 0,
        referenceFrame: 0,
        points: start,
      },
      {
        id: `${exerciseId}-effort`,
        name: "发力",
        timeMs: durationMs / 2,
        referenceFrame: 1,
        points: end,
      },
      {
        id: `${exerciseId}-return`,
        name: "回位",
        timeMs: durationMs,
        referenceFrame: 0,
        points: buildLandmarks(pose.start),
      },
    ],
    annotations: (endClassification?.angleOverlays ?? []).map((overlay) => ({
      id: overlay.id,
      label: overlay.id,
      startIndex: overlay.startIndex,
      vertexIndex: overlay.vertexIndex,
      endIndex: overlay.endIndex,
      radius: 0.055,
      labelOffset: { x: 0, y: 0 },
    })),
  };
}

const BUILT_IN_EXERCISE_MOTIONS: Record<CatalogExerciseId, MotionProject> = {
  squat: createBuiltInMotionProject("squat", SQUAT, "squat"),
  "push-up": createBuiltInMotionProject("push-up", PUSH_UP, "push-up"),
  "jumping-jack": createBuiltInMotionProject(
    "jumping-jack",
    JUMPING_JACK,
    "jumping-jack",
  ),
  lunge: createBuiltInMotionProject("lunge", LUNGE, "lunge"),
  superman: createBuiltInMotionProject("superman", SUPERMAN),
  "close-grip-push-up": createBuiltInMotionProject(
    "close-grip-push-up",
    CLOSE_GRIP_PUSH_UP,
  ),
  "mountain-climber": createBuiltInMotionProject(
    "mountain-climber",
    MOUNTAIN_CLIMBER,
  ),
};

export function getBuiltInExerciseDemoProject(
  exerciseId: CatalogExerciseId,
): MotionProject {
  return BUILT_IN_EXERCISE_MOTIONS[exerciseId];
}

export function getExerciseDemoPoseAmount(progress: number): number {
  const cycle = ((progress % 1) + 1) % 1;
  return (1 - Math.cos(cycle * Math.PI * 2)) / 2;
}

export function getExerciseDemoKeyframe(progress: number): 0 | 1 {
  return getExerciseDemoPoseAmount(progress) >= 0.5 ? 1 : 0;
}

export function getExerciseDemoCriticalMarkup(
  angleOverlays: readonly PoseAngleOverlay[],
): ExerciseDemoCriticalMarkup {
  const segments: Array<readonly [number, number]> = [];
  const segmentKeys = new Set<string>();
  const pointIndices: number[] = [];
  const pointIndexSet = new Set<number>();

  for (const overlay of angleOverlays) {
    for (const index of [
      overlay.startIndex,
      overlay.vertexIndex,
      overlay.endIndex,
    ]) {
      if (pointIndexSet.has(index)) continue;
      pointIndexSet.add(index);
      pointIndices.push(index);
    }

    for (const segment of [
      [overlay.startIndex, overlay.vertexIndex],
      [overlay.vertexIndex, overlay.endIndex],
    ] as const) {
      const [startIndex, endIndex] = segment;
      const key =
        startIndex < endIndex
          ? `${startIndex}:${endIndex}`
          : `${endIndex}:${startIndex}`;
      if (segmentKeys.has(key)) continue;
      segmentKeys.add(key);
      segments.push(segment);
    }
  }

  return { segments, pointIndices };
}

export function getExerciseDemoFrame(
  exerciseId: ExerciseId,
  progress: number,
): ExerciseDemoFrame {
  const pose = DEMO_POSES[exerciseId];
  const start = buildLandmarks(pose.start);
  const end = buildLandmarks(pose.end);
  const amount = getExerciseDemoPoseAmount(progress);
  const landmarks = start.map((point, index) => {
    const next = end[index];
    if ((point.visibility ?? 0) === 0 || (next.visibility ?? 0) === 0) {
      return { ...point };
    }
    return {
      x: point.x + (next.x - point.x) * amount,
      y: point.y + (next.y - point.y) * amount,
      visibility: 1,
    };
  });
  const classification = classifyPose(exerciseId, {
    landmarks,
    size: { width: 1_000, height: 1_000 },
    timestamp: progress * 1_000,
  });

  return {
    landmarks,
    angleOverlays: classification.angleOverlays,
  };
}
