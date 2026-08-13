import type { MotionProject } from "../src/lib/editor-model.ts";

const CONNECTIONS: MotionProject["skeleton"]["connections"] = [
  [0, 11], [0, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [29, 31],
  [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

type DemoJoint = readonly [index: number, x: number, y: number];

interface AnnotationTemplate {
  label: string;
  joints: readonly [startIndex: number, vertexIndex: number, endIndex: number];
}

interface StarterTemplate {
  start: readonly DemoJoint[];
  end: readonly DemoJoint[];
  annotations: readonly AnnotationTemplate[];
}

const STARTER_TEMPLATES: Record<string, StarterTemplate> = {
  squat: {
    start: [
      [0, 0.59, 0.24], [7, 0.49, 0.08], [8, 0.54, 0.07],
      [11, 0.45, 0.35], [12, 0.51, 0.35], [13, 0.45, 0.49], [14, 0.52, 0.49],
      [15, 0.48, 0.64], [16, 0.55, 0.64], [23, 0.47, 0.58], [24, 0.52, 0.58],
      [25, 0.48, 0.75], [26, 0.53, 0.75], [27, 0.48, 0.91], [28, 0.54, 0.91],
      [29, 0.46, 0.91], [30, 0.52, 0.91], [31, 0.54, 0.92], [32, 0.6, 0.92],
    ],
    end: [
      [0, 0.59, 0.31], [7, 0.48, 0.18], [8, 0.53, 0.18],
      [11, 0.47, 0.43], [12, 0.53, 0.44], [13, 0.55, 0.52], [14, 0.59, 0.52],
      [15, 0.63, 0.42], [16, 0.65, 0.43], [23, 0.43, 0.59], [24, 0.49, 0.6],
      [25, 0.583, 0.7], [26, 0.6, 0.71], [27, 0.44, 0.9], [28, 0.52, 0.9],
      [29, 0.42, 0.91], [30, 0.5, 0.91], [31, 0.49, 0.92], [32, 0.58, 0.92],
    ],
    annotations: [
      { label: "左膝角", joints: [23, 25, 27] },
      { label: "右膝角", joints: [24, 26, 28] },
    ],
  },
  "push-up": {
    start: [
      [0, 0.18, 0.31], [7, 0.22, 0.13], [8, 0.28, 0.16],
      [11, 0.32, 0.4], [12, 0.35, 0.43], [13, 0.33, 0.59], [14, 0.36, 0.62],
      [15, 0.34, 0.77], [16, 0.37, 0.8], [23, 0.6, 0.48], [24, 0.63, 0.51],
      [25, 0.72, 0.56], [26, 0.75, 0.59], [27, 0.84, 0.66], [28, 0.87, 0.69],
      [29, 0.83, 0.68], [30, 0.86, 0.71], [31, 0.9, 0.68], [32, 0.93, 0.71],
    ],
    end: [
      [0, 0.16, 0.61], [7, 0.2, 0.48], [8, 0.25, 0.49],
      [11, 0.33, 0.55], [12, 0.36, 0.58], [13, 0.445, 0.65], [14, 0.48, 0.68],
      [15, 0.34, 0.77], [16, 0.37, 0.8], [23, 0.61, 0.625], [24, 0.64, 0.64],
      [25, 0.73, 0.65], [26, 0.76, 0.68], [27, 0.85, 0.69], [28, 0.88, 0.72],
      [29, 0.84, 0.71], [30, 0.87, 0.74], [31, 0.91, 0.71], [32, 0.94, 0.74],
    ],
    annotations: [
      { label: "左肘角", joints: [11, 13, 15] },
      { label: "身体直线", joints: [11, 23, 27] },
    ],
  },
  "jumping-jack": {
    start: [
      [0, 0.5, 0.26], [7, 0.45, 0.1], [8, 0.55, 0.1],
      [11, 0.42, 0.34], [12, 0.58, 0.34], [13, 0.41, 0.52], [14, 0.59, 0.52],
      [15, 0.4, 0.64], [16, 0.6, 0.64], [23, 0.46, 0.56], [24, 0.54, 0.56],
      [25, 0.47, 0.74], [26, 0.53, 0.74], [27, 0.48, 0.91], [28, 0.52, 0.91],
      [29, 0.46, 0.91], [30, 0.5, 0.91], [31, 0.53, 0.92], [32, 0.57, 0.92],
    ],
    end: [
      [0, 0.39, 0.29], [7, 0.34, 0.1], [8, 0.42, 0.1],
      [11, 0.38, 0.35], [12, 0.49, 0.35], [13, 0.27, 0.2], [14, 0.56, 0.2],
      [15, 0.15, 0.1], [16, 0.605, 0.1], [23, 0.43, 0.57], [24, 0.51, 0.57],
      [25, 0.32, 0.75], [26, 0.62, 0.75], [27, 0.18, 0.92], [28, 0.68, 0.92],
      [29, 0.15, 0.93], [30, 0.65, 0.93], [31, 0.22, 0.94], [32, 0.72, 0.94],
    ],
    annotations: [
      { label: "左肩角", joints: [23, 11, 15] },
      { label: "右肩角", joints: [24, 12, 16] },
    ],
  },
  lunge: {
    start: [
      [0, 0.58, 0.25], [7, 0.48, 0.08], [8, 0.53, 0.07],
      [11, 0.45, 0.35], [12, 0.51, 0.35], [13, 0.45, 0.49], [14, 0.52, 0.49],
      [15, 0.48, 0.64], [16, 0.55, 0.64], [23, 0.47, 0.58], [24, 0.52, 0.58],
      [25, 0.46, 0.75], [26, 0.54, 0.75], [27, 0.46, 0.91], [28, 0.55, 0.91],
      [29, 0.44, 0.92], [30, 0.53, 0.92], [31, 0.51, 0.93], [32, 0.61, 0.93],
    ],
    end: [
      [0, 0.53, 0.27], [7, 0.37, 0.09], [8, 0.43, 0.08],
      [11, 0.38, 0.36], [12, 0.44, 0.37], [13, 0.3, 0.5], [14, 0.5, 0.49],
      [15, 0.38, 0.58], [16, 0.44, 0.58], [23, 0.345, 0.593], [24, 0.47, 0.57],
      [25, 0.352, 0.764], [26, 0.689, 0.7], [27, 0.143, 0.773], [28, 0.57, 0.9],
      [29, 0.09, 0.83], [30, 0.55, 0.91], [31, 0.16, 0.84], [32, 0.65, 0.92],
    ],
    annotations: [
      { label: "左膝角", joints: [23, 25, 27] },
      { label: "右膝角", joints: [24, 26, 28] },
    ],
  },
};

function points(joints: ReadonlyArray<readonly [number, number, number]>) {
  const result = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  for (const [index, x, y] of joints) result[index] = { x, y, z: 0, visibility: 1 };
  return result;
}

export function createStarterMotionProject(input: {
  name: string;
  exerciseId: string;
  durationMs: number;
}): MotionProject {
  const startedAt = Date.now().toString(36);
  const template = STARTER_TEMPLATES[input.exerciseId] ?? STARTER_TEMPLATES.squat;
  const startPoints = points(template.start);
  const endPoints = points(template.end);
  return {
    schemaVersion: 1,
    name: input.name,
    durationMs: input.durationMs,
    easing: "ease-in-out",
    loop: true,
    canvas: { width: 720, height: 720 },
    reference: {
      exerciseId: input.exerciseId as MotionProject["reference"]["exerciseId"],
      visible: true,
      opacity: 0.94,
    },
    character: {
      renderer: "sprite-frames",
      assetId: "husky-exercise-sprites-v2",
    },
    display: { skeleton: true, joints: true, angles: true },
    skeleton: { connections: CONNECTIONS.map(([start, end]) => [start, end]) },
    keyframes: [
      { id: `keyframe-${startedAt}-1`, name: "起始", timeMs: 0, referenceFrame: 0, points: startPoints },
      { id: `keyframe-${startedAt}-2`, name: "发力", timeMs: Math.round(input.durationMs / 2), referenceFrame: 1, points: endPoints },
      { id: `keyframe-${startedAt}-3`, name: "回位", timeMs: input.durationMs, referenceFrame: 0, points: points(template.start) },
    ],
    annotations: template.annotations.map((annotation, index) => ({
      id: `angle-${startedAt}-${index + 1}`,
      label: annotation.label,
      startIndex: annotation.joints[0],
      vertexIndex: annotation.joints[1],
      endIndex: annotation.joints[2],
      radius: 0.055,
      labelOffset: { x: 0, y: 0 },
    })),
  };
}
