import type { ExerciseId } from "../domain/exercises";
import {
  average,
  axisAngleFromHorizontal,
  clamp,
  FULL_NORMALIZED_BOUNDS,
  jointAngle,
  pointDistance,
  type FrameSize,
  type NormalizedBounds,
  type PosePoint,
} from "./geometry";

export type CounterPhase = "seeking-start" | "ready" | "moving" | "end-held";
export type FramingDirection = "forward" | "backward" | "left" | "right";

export interface PoseFrame {
  landmarks: readonly PosePoint[];
  worldLandmarks?: readonly PosePoint[];
  size: FrameSize;
  visibleBounds?: NormalizedBounds;
  timestamp: number;
}

export interface FormClassification {
  valid: boolean;
  start: boolean;
  end: boolean;
  quality: number;
  metric: number | null;
  angleOverlays: readonly PoseAngleOverlay[];
  feedback: string;
  framingDirection?: FramingDirection;
  baseline?: {
    hipY: number;
    legLength: number;
  };
}

export interface RepCounterState {
  count: number;
  phase: CounterPhase;
  candidateSince: number | null;
  cycleStartedAt: number | null;
  lastRepAt: number | null;
  validSince: number | null;
  invalidSince: number | null;
  baseline: {
    hipY: number;
    legLength: number;
  } | null;
}

export interface RepCounterUpdate {
  state: RepCounterState;
  didCount: boolean;
  feedback: string;
  quality: number;
  metric: number | null;
  angleOverlays: readonly PoseAngleOverlay[];
  requirementsMet: boolean;
  framingDirection: FramingDirection | null;
}

export interface PoseAngleOverlay {
  id: string;
  startIndex: number;
  vertexIndex: number;
  endIndex: number;
  degrees: number;
}

const START_HOLD_MS = 150;
const END_HOLD_MS = 120;
const RECOVERY_HOLD_MS = 180;
const INVALID_RESET_MS = 150;
const REP_DEBOUNCE_MS = 400;
const MAX_CYCLE_MS = 8_000;

const MIN_CYCLE_MS: Record<ExerciseId, number> = {
  squat: 650,
  "push-up": 550,
  "jumping-jack": 550,
  lunge: 650,
};

const INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

interface SidePoints {
  shoulder: PosePoint;
  elbow: PosePoint;
  wrist: PosePoint;
  hip: PosePoint;
  knee: PosePoint;
  ankle: PosePoint;
}

type SidePointKey = keyof SidePoints;

interface SideIndices {
  shoulder: number;
  elbow: number;
  wrist: number;
  hip: number;
  knee: number;
  ankle: number;
}

const SIDE_INDICES: Record<"left" | "right", SideIndices> = {
  left: {
    shoulder: INDEX.leftShoulder,
    elbow: INDEX.leftElbow,
    wrist: INDEX.leftWrist,
    hip: INDEX.leftHip,
    knee: INDEX.leftKnee,
    ankle: INDEX.leftAnkle,
  },
  right: {
    shoulder: INDEX.rightShoulder,
    elbow: INDEX.rightElbow,
    wrist: INDEX.rightWrist,
    hip: INDEX.rightHip,
    knee: INDEX.rightKnee,
    ankle: INDEX.rightAnkle,
  },
};

const SQUAT_TRACKED_POINTS = [
  "shoulder",
  "hip",
  "knee",
  "ankle",
] as const satisfies readonly SidePointKey[];

const PUSH_UP_TRACKED_POINTS = [
  "shoulder",
  "elbow",
  "wrist",
  "hip",
  "ankle",
] as const satisfies readonly SidePointKey[];

export function createRepCounterState(): RepCounterState {
  return {
    count: 0,
    phase: "seeking-start",
    candidateSince: null,
    cycleStartedAt: null,
    lastRepAt: null,
    validSince: null,
    invalidSince: null,
    baseline: null,
  };
}

function visibility(point: PosePoint | undefined): number {
  if (!point) return 0;
  return point.visibility ?? 1;
}

function framingDirection(
  points: readonly (PosePoint | undefined)[],
  bounds: NormalizedBounds,
): FramingDirection | null {
  const boundsWidth = Math.max(Number.EPSILON, bounds.maxX - bounds.minX);
  const boundsHeight = Math.max(Number.EPSILON, bounds.maxY - bounds.minY);
  let reliableCount = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let leftOverflow = 0;
  let rightOverflow = 0;
  let topOverflow = 0;
  let bottomOverflow = 0;
  let leftOverflowCount = 0;
  let rightOverflowCount = 0;

  for (const point of points) {
    if (
      !point ||
      visibility(point) < 0.35 ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      continue;
    }

    reliableCount += 1;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);

    if (point.x < bounds.minX) {
      const overflow = (bounds.minX - point.x) / boundsWidth;
      if (overflow >= 0.02) {
        leftOverflow += overflow;
        leftOverflowCount += 1;
      }
    } else if (point.x > bounds.maxX) {
      const overflow = (point.x - bounds.maxX) / boundsWidth;
      if (overflow >= 0.02) {
        rightOverflow += overflow;
        rightOverflowCount += 1;
      }
    }
    if (point.y < bounds.minY) {
      const overflow = (bounds.minY - point.y) / boundsHeight;
      if (overflow >= 0.02) topOverflow += overflow;
    } else if (point.y > bounds.maxY) {
      const overflow = (point.y - bounds.maxY) / boundsHeight;
      if (overflow >= 0.02) bottomOverflow += overflow;
    }
  }

  if (reliableCount < Math.ceil(points.length * 0.5)) return null;

  const horizontalSpan = (maxX - minX) / boundsWidth;
  const verticalSpan = (maxY - minY) / boundsHeight;
  const relativeDiagonal = Math.hypot(horizontalSpan, verticalSpan) / Math.SQRT2;
  const horizontalOverflow = Math.max(leftOverflow, rightOverflow);
  const verticalOverflow = Math.max(topOverflow, bottomOverflow);

  const enoughForScale = reliableCount >= Math.ceil(points.length * 0.75);
  if (
    (leftOverflow >= 0.02 && rightOverflow >= 0.02) ||
    (topOverflow >= 0.02 && bottomOverflow >= 0.02) ||
    (enoughForScale && Math.max(horizontalSpan, verticalSpan) >= 0.92) ||
    (verticalOverflow >= 0.02 && verticalOverflow >= horizontalOverflow)
  ) {
    return "backward";
  }

  if (horizontalOverflow >= 0.025) {
    const leftWins = leftOverflow > rightOverflow;
    const winningOverflow = leftWins ? leftOverflow : rightOverflow;
    const losingOverflow = leftWins ? rightOverflow : leftOverflow;
    const winningCount = leftWins ? leftOverflowCount : rightOverflowCount;
    if (
      (winningCount >= 2 || winningOverflow >= 0.06) &&
      winningOverflow >= losingOverflow * 1.8
    ) {
      // The preview is mirrored: raw-left appears on the user's right.
      return leftWins ? "left" : "right";
    }
  }

  if (
    reliableCount === points.length &&
    relativeDiagonal >= 0.04 &&
    relativeDiagonal < 0.16
  ) {
    return "forward";
  }

  return null;
}

function visibleEnough(
  points: readonly (PosePoint | undefined)[],
  bounds = FULL_NORMALIZED_BOUNDS,
): {
  valid: boolean;
  quality: number;
  framingDirection: FramingDirection | null;
} {
  if (points.length === 0) {
    return { valid: false, quality: 0, framingDirection: null };
  }

  let qualityTotal = 0;
  let minimumVisibility = 1;
  let insideFrame = true;
  for (const point of points) {
    if (!point) {
      return { valid: false, quality: 0, framingDirection: null };
    }
    const pointVisibility = visibility(point);
    qualityTotal += pointVisibility;
    minimumVisibility = Math.min(minimumVisibility, pointVisibility);
    insideFrame &&=
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY;
  }

  const quality = qualityTotal / points.length;
  const valid = insideFrame && minimumVisibility >= 0.55 && quality >= 0.68;
  return {
    valid,
    quality,
    framingDirection: valid ? null : framingDirection(points, bounds),
  };
}

function selectSide(
  frame: PoseFrame,
  trackedPoints: readonly SidePointKey[],
): {
  side: "left" | "right";
  indices: SideIndices;
  normalized: SidePoints;
  world?: SidePoints;
} {
  const landmark = frame.landmarks;
  const world = frame.worldLandmarks;

  const sideGate = (side: "left" | "right") => {
    const indices = SIDE_INDICES[side];
    return visibleEnough(
      trackedPoints.map((point) => landmark[indices[point]]),
      frame.visibleBounds,
    );
  };

  const leftGate = sideGate("left");
  const rightGate = sideGate("right");
  const selectedSide =
    leftGate.valid !== rightGate.valid
      ? leftGate.valid
        ? "left"
        : "right"
      : leftGate.quality >= rightGate.quality
        ? "left"
        : "right";
  const selectedIndices = SIDE_INDICES[selectedSide];
  const indices = Object.values(selectedIndices);

  const points = indices.map((index) => landmark[index]) as PosePoint[];
  const worldPoints = world?.length
    ? (indices.map((index) => world[index]) as PosePoint[])
    : undefined;

  return {
    side: selectedSide,
    indices: selectedIndices,
    normalized: {
      shoulder: points[0],
      elbow: points[1],
      wrist: points[2],
      hip: points[3],
      knee: points[4],
      ankle: points[5],
    },
    world: worldPoints
      ? {
          shoulder: worldPoints[0],
          elbow: worldPoints[1],
          wrist: worldPoints[2],
          hip: worldPoints[3],
          knee: worldPoints[4],
          ankle: worldPoints[5],
        }
      : undefined,
  };
}

function angle(
  normalized: [PosePoint, PosePoint, PosePoint],
  world: [PosePoint, PosePoint, PosePoint] | undefined,
  size: FrameSize,
): number {
  return world
    ? jointAngle(world[0], world[1], world[2])
    : jointAngle(normalized[0], normalized[1], normalized[2], size);
}

function classifySquat(
  frame: PoseFrame,
  baseline?: RepCounterState["baseline"],
): FormClassification {
  const side = selectSide(frame, SQUAT_TRACKED_POINTS);
  const gate = visibleEnough(
    [
      side.normalized.shoulder,
      side.normalized.hip,
      side.normalized.knee,
      side.normalized.ankle,
    ],
    frame.visibleBounds,
  );

  if (!gate.valid) {
    return invalidClassification(
      gate.quality,
      "让肩、髋、膝和脚踝进入画面",
      gate.framingDirection,
    );
  }

  const knee = angle(
    [side.normalized.hip, side.normalized.knee, side.normalized.ankle],
    side.world ? [side.world.hip, side.world.knee, side.world.ankle] : undefined,
    frame.size,
  );
  const hip = angle(
    [side.normalized.shoulder, side.normalized.hip, side.normalized.knee],
    side.world ? [side.world.shoulder, side.world.hip, side.world.knee] : undefined,
    frame.size,
  );

  const hipY = side.normalized.hip.y * frame.size.height;
  const legLength = pointDistance(
    side.normalized.hip,
    side.normalized.ankle,
    frame.size,
  );
  const hipDrop =
    baseline && baseline.legLength > 0
      ? (hipY - baseline.hipY) / baseline.legLength
      : 0;

  return {
    valid: true,
    start: knee >= 160 && hip >= 150,
    end: knee <= 105 && hipDrop >= 0.1,
    quality: gate.quality,
    metric: Math.round(knee),
    angleOverlays: [
      {
        id: `${side.side}-knee`,
        startIndex: side.indices.hip,
        vertexIndex: side.indices.knee,
        endIndex: side.indices.ankle,
        degrees: Math.round(knee),
      },
    ],
    feedback:
      knee > 105 || hipDrop < 0.1
        ? "继续下蹲，让髋部明显下降"
        : "深度很好，站起来",
    baseline: { hipY, legLength },
  };
}

function classifyPushUp(frame: PoseFrame): FormClassification {
  const side = selectSide(frame, PUSH_UP_TRACKED_POINTS);
  const gate = visibleEnough(
    [
      side.normalized.shoulder,
      side.normalized.elbow,
      side.normalized.wrist,
      side.normalized.hip,
      side.normalized.ankle,
    ],
    frame.visibleBounds,
  );

  if (!gate.valid) {
    return invalidClassification(
      gate.quality,
      "让肩、肘、手腕、髋和脚踝进入画面",
      gate.framingDirection,
    );
  }

  const elbow = angle(
    [side.normalized.shoulder, side.normalized.elbow, side.normalized.wrist],
    side.world
      ? [side.world.shoulder, side.world.elbow, side.world.wrist]
      : undefined,
    frame.size,
  );
  const bodyLine = angle(
    [side.normalized.shoulder, side.normalized.hip, side.normalized.ankle],
    side.world
      ? [side.world.shoulder, side.world.hip, side.world.ankle]
      : undefined,
    frame.size,
  );
  const bodyAxis = axisAngleFromHorizontal(
    side.normalized.shoulder,
    side.normalized.ankle,
    frame.size,
  );
  const formReady = bodyLine >= 140 && bodyAxis <= 45;

  return {
    valid: true,
    start: formReady && elbow >= 155,
    end: formReady && elbow <= 95,
    quality: gate.quality,
    metric: Math.round(elbow),
    angleOverlays: [
      {
        id: `${side.side}-elbow`,
        startIndex: side.indices.shoulder,
        vertexIndex: side.indices.elbow,
        endIndex: side.indices.wrist,
        degrees: Math.round(elbow),
      },
      {
        id: `${side.side}-body-line`,
        startIndex: side.indices.shoulder,
        vertexIndex: side.indices.hip,
        endIndex: side.indices.ankle,
        degrees: Math.round(bodyLine),
      },
    ],
    feedback: !formReady
      ? "收紧核心，让肩、髋、脚踝保持一条直线"
      : elbow > 95
        ? "屈肘下压，胸口靠近地面"
        : "到位，推回顶部",
  };
}

function classifyJumpingJack(frame: PoseFrame): FormClassification {
  const landmark = frame.landmarks;
  const required = [
    INDEX.leftShoulder,
    INDEX.rightShoulder,
    INDEX.leftWrist,
    INDEX.rightWrist,
    INDEX.leftHip,
    INDEX.rightHip,
    INDEX.leftAnkle,
    INDEX.rightAnkle,
  ].map((index) => landmark[index]);
  const gate = visibleEnough(required, frame.visibleBounds);

  if (!gate.valid) {
    return invalidClassification(
      gate.quality,
      "让双肩、手腕、髋和脚踝进入画面",
      gate.framingDirection,
    );
  }

  const [leftShoulder, rightShoulder, leftWrist, rightWrist, leftHip, rightHip, leftAnkle, rightAnkle] =
    required as PosePoint[];
  const leftArm = jointAngle(leftHip, leftShoulder, leftWrist, frame.size);
  const rightArm = jointAngle(rightHip, rightShoulder, rightWrist, frame.size);
  const armAngle = average([leftArm, rightArm]);
  const shoulderWidth = pointDistance(leftShoulder, rightShoulder, frame.size);
  const ankleSpan = pointDistance(leftAnkle, rightAnkle, frame.size);
  const spanRatio = shoulderWidth > 0 ? ankleSpan / shoulderWidth : 0;
  const balanced = Math.abs(leftArm - rightArm) <= 40;

  return {
    valid: true,
    start: armAngle <= 35 && spanRatio <= 1.15,
    end: balanced && armAngle >= 145 && spanRatio >= 1.65,
    quality: gate.quality,
    metric: Math.round(armAngle),
    angleOverlays: [
      {
        id: "left-shoulder",
        startIndex: INDEX.leftHip,
        vertexIndex: INDEX.leftShoulder,
        endIndex: INDEX.leftWrist,
        degrees: Math.round(leftArm),
      },
      {
        id: "right-shoulder",
        startIndex: INDEX.rightHip,
        vertexIndex: INDEX.rightShoulder,
        endIndex: INDEX.rightWrist,
        degrees: Math.round(rightArm),
      },
    ],
    feedback: !balanced
      ? "两只手一起举高"
      : armAngle < 145 || spanRatio < 1.65
        ? "手举过头顶，同时双脚跳开"
        : "打开到位，回到并拢站姿",
  };
}

function classifyLunge(frame: PoseFrame): FormClassification {
  const landmark = frame.landmarks;
  const world = frame.worldLandmarks;
  const requiredIndices = [23, 24, 25, 26, 27, 28];
  const required = requiredIndices.map((index) => landmark[index]);
  const gate = visibleEnough(required, frame.visibleBounds);

  if (!gate.valid) {
    return invalidClassification(
      gate.quality,
      "让髋、双膝和双脚踝进入画面",
      gate.framingDirection,
    );
  }

  const [leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle] =
    required as PosePoint[];
  const worldPoint = (index: number) => world?.[index];
  const leftKneeAngle = angle(
    [leftHip, leftKnee, leftAnkle],
    worldPoint(23) && worldPoint(25) && worldPoint(27)
      ? [worldPoint(23)!, worldPoint(25)!, worldPoint(27)!]
      : undefined,
    frame.size,
  );
  const rightKneeAngle = angle(
    [rightHip, rightKnee, rightAnkle],
    worldPoint(24) && worldPoint(26) && worldPoint(28)
      ? [worldPoint(24)!, worldPoint(26)!, worldPoint(28)!]
      : undefined,
    frame.size,
  );
  const frontKnee = Math.min(leftKneeAngle, rightKneeAngle);
  const backKnee = Math.max(leftKneeAngle, rightKneeAngle);
  const legLength = average([
    pointDistance(leftHip, leftAnkle, frame.size),
    pointDistance(rightHip, rightAnkle, frame.size),
  ]);
  const foreAftSpan = Math.abs(leftAnkle.x - rightAnkle.x) * frame.size.width;
  const strideReady = legLength > 0 && foreAftSpan / legLength >= 0.28;

  return {
    valid: true,
    start: leftKneeAngle >= 155 && rightKneeAngle >= 155,
    end: strideReady && frontKnee <= 105 && backKnee <= 135,
    quality: gate.quality,
    metric: Math.round(frontKnee),
    angleOverlays: [
      {
        id: "left-knee",
        startIndex: INDEX.leftHip,
        vertexIndex: INDEX.leftKnee,
        endIndex: INDEX.leftAnkle,
        degrees: Math.round(leftKneeAngle),
      },
      {
        id: "right-knee",
        startIndex: INDEX.rightHip,
        vertexIndex: INDEX.rightKnee,
        endIndex: INDEX.rightAnkle,
        degrees: Math.round(rightKneeAngle),
      },
    ],
    feedback: !strideReady
      ? "前后脚再分开一些"
      : frontKnee > 105 || backKnee > 135
        ? "垂直下沉，让前后膝都弯曲"
        : "到位，推回站姿",
  };
}

function invalidClassification(
  quality: number,
  feedback: string,
  direction: FramingDirection | null = null,
): FormClassification {
  return {
    valid: false,
    start: false,
    end: false,
    quality,
    metric: null,
    angleOverlays: [],
    feedback,
    framingDirection: direction ?? undefined,
  };
}

export function classifyPose(exerciseId: ExerciseId, frame: PoseFrame): FormClassification {
  if (frame.landmarks.length < 29) {
    return invalidClassification(0, "关键关节进入画面后自动开始识别");
  }

  switch (exerciseId) {
    case "squat":
      return classifySquat(frame);
    case "push-up":
      return classifyPushUp(frame);
    case "jumping-jack":
      return classifyJumpingJack(frame);
    case "lunge":
      return classifyLunge(frame);
  }
}

function resetCycle(state: RepCounterState): RepCounterState {
  return {
    ...state,
    phase: "seeking-start",
    candidateSince: null,
    cycleStartedAt: null,
    baseline: null,
  };
}

function withCandidate(
  state: RepCounterState,
  timestamp: number,
): { state: RepCounterState; heldFor: number } {
  const candidateSince = state.candidateSince ?? timestamp;
  return {
    state: { ...state, candidateSince },
    heldFor: timestamp - candidateSince,
  };
}

export function advanceRepCounter(
  exerciseId: ExerciseId,
  state: RepCounterState,
  classification: FormClassification,
  timestamp: number,
): RepCounterUpdate {
  let next = { ...state };

  if (!classification.valid) {
    const invalidSince = next.invalidSince ?? timestamp;
    next = { ...next, invalidSince, validSince: null, candidateSince: null };
    if (timestamp - invalidSince >= INVALID_RESET_MS && next.phase !== "seeking-start") {
      next = { ...resetCycle(next), invalidSince };
    }
    return result(next, false, classification);
  }

  const validSince = next.validSince ?? timestamp;
  next = { ...next, validSince, invalidSince: null };
  if (timestamp - validSince < RECOVERY_HOLD_MS) {
    return result(next, false, classification, "保持一下，正在锁定姿势");
  }

  if (
    next.cycleStartedAt !== null &&
    timestamp - next.cycleStartedAt > MAX_CYCLE_MS
  ) {
    next = resetCycle(next);
  }

  switch (next.phase) {
    case "seeking-start": {
      if (!classification.start) {
        next.candidateSince = null;
        return result(next, false, classification);
      }
      const candidate = withCandidate(next, timestamp);
      next = candidate.state;
      if (candidate.heldFor >= START_HOLD_MS) {
        next = {
          ...next,
          phase: "ready",
          candidateSince: null,
          baseline: classification.baseline ?? next.baseline,
        };
        return result(next, false, classification, "姿势已锁定，开始吧");
      }
      break;
    }
    case "ready":
      if (classification.start && classification.baseline) {
        next.baseline = classification.baseline;
      }
      if (!classification.start) {
        next = {
          ...next,
          phase: "moving",
          cycleStartedAt: timestamp,
          candidateSince: null,
        };
      }
      break;
    case "moving": {
      if (classification.start) {
        next = { ...next, phase: "ready", cycleStartedAt: null, candidateSince: null };
        break;
      }
      if (!classification.end) {
        next.candidateSince = null;
        break;
      }
      const candidate = withCandidate(next, timestamp);
      next = candidate.state;
      if (candidate.heldFor >= END_HOLD_MS) {
        next = { ...next, phase: "end-held", candidateSince: null };
      }
      break;
    }
    case "end-held": {
      if (!classification.start) {
        next.candidateSince = null;
        break;
      }
      const candidate = withCandidate(next, timestamp);
      next = candidate.state;
      const cycleDuration = timestamp - (next.cycleStartedAt ?? timestamp);
      const sinceLastRep = timestamp - (next.lastRepAt ?? -Infinity);
      if (
        candidate.heldFor >= START_HOLD_MS &&
        cycleDuration >= MIN_CYCLE_MS[exerciseId] &&
        sinceLastRep >= REP_DEBOUNCE_MS
      ) {
        next = {
          ...next,
          count: next.count + 1,
          phase: "ready",
          candidateSince: null,
          cycleStartedAt: null,
          lastRepAt: timestamp,
        };
        return result(next, true, classification, "漂亮，完成一次");
      }
      break;
    }
  }

  return result(next, false, classification);
}

function result(
  state: RepCounterState,
  didCount: boolean,
  classification: FormClassification,
  feedback = classification.feedback,
): RepCounterUpdate {
  return {
    state,
    didCount,
    feedback,
    quality: clamp(classification.quality, 0, 1),
    metric: classification.metric,
    angleOverlays: classification.angleOverlays,
    requirementsMet: classification.valid,
    framingDirection: classification.framingDirection ?? null,
  };
}

export function updateRepCounter(
  exerciseId: ExerciseId,
  state: RepCounterState,
  frame: PoseFrame,
): RepCounterUpdate {
  const classification =
    exerciseId === "squat"
      ? classifySquat(frame, state.baseline)
      : classifyPose(exerciseId, frame);
  return advanceRepCounter(exerciseId, state, classification, frame.timestamp);
}
