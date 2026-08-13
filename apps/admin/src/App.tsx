import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { getCatalogExerciseLabel } from "@workout-detect/core/domain/exercise-catalog";
import { EXERCISES, getExercise, type ExerciseId } from "@workout-detect/core/domain/exercises";
import { jointAngle } from "@workout-detect/core/lib/geometry";
import huskySpriteUrl from "@workout-detect/core/assets/husky-exercise-sprites-v2.png";
import {
  ANGLE_PRESETS,
  JOINT_BY_INDEX,
  addKeyframeAt,
  clonePoints,
  connectionKey,
  createAnnotation,
  createMotionProject,
  findRestorableConnection,
  interpolatePose,
  parseMotionProject,
  sortedKeyframes,
  type AngleAnnotation,
  type BoneConnection,
  type MotionProject,
  type PoseKeyframe,
} from "./lib/editor-model";
import { drawScene, getAngleGeometry } from "./lib/scene-renderer";

const STORAGE_KEY = "form-beat:motion-lab:v1";
const HISTORY_LIMIT = 60;

type InspectorTab = "pose" | "annotations" | "project";
type IconName =
  | "angle"
  | "back"
  | "chevron"
  | "download"
  | "file"
  | "frames"
  | "image"
  | "pause"
  | "play"
  | "plus"
  | "redo"
  | "skeleton"
  | "trash"
  | "undo";

interface DragState {
  type: "joint" | "angle";
  snapshot: MotionProject;
  changed: boolean;
  keyframeId?: string;
  jointIndex?: number;
  annotationId?: string;
  pointerStart?: { x: number; y: number };
  offsetStart?: { x: number; y: number };
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    angle: <><path d="M5 18 12 5l7 13" /><path d="M8.2 14.3a6 6 0 0 1 7.6 0" /></>,
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
    chevron: <path d="m9 6 6 6-6 6" />,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /></>,
    frames: <><path d="M4 7h13v12H4z" /><path d="M7 4h13v12" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m3 15 5-5 4 4 2-2 7 7" /><circle cx="16.5" cy="8.5" r="1.5" /></>,
    pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
    play: <path d="m8 5 11 7-11 7z" />,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    redo: <><path d="m15 6 4 4-4 4" /><path d="M19 10h-8a6 6 0 0 0-6 6v1" /></>,
    skeleton: <><circle cx="12" cy="4" r="2" /><path d="M12 6v6m-5-3 5 3 5-3m-5 3-4 8m4-8 4 8" /></>,
    trash: <><path d="M4 7h16" /><path d="m9 7 1-3h4l1 3" /><path d="m6 7 1 14h10l1-14" /></>,
    undo: <><path d="m9 6-4 4 4 4" /><path d="M5 10h8a6 6 0 0 1 6 6v1" /></>,
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function loadInitialProject(): MotionProject {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseMotionProject(JSON.parse(saved)) : createMotionProject();
  } catch {
    return createMotionProject();
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_\u4e00-\u9fa5]+/g, "-") || "motion";
}

function formatTime(timeMs: number): string {
  return `${(timeMs / 1_000).toFixed(2)}s`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function copyProject(project: MotionProject): MotionProject {
  return structuredClone(project);
}

function connectionLabel(connection: readonly [number, number]): string {
  const start = JOINT_BY_INDEX.get(connection[0])?.label ?? `关节 ${connection[0]}`;
  const end = JOINT_BY_INDEX.get(connection[1])?.label ?? `关节 ${connection[1]}`;
  return `${start}—${end}`;
}

function pointToSegmentDistance(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const lengthSquared = segmentX ** 2 + segmentY ** 2;
  if (lengthSquared === 0) return Math.hypot(pointX - startX, pointY - startY);
  const amount = clamp(
    ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / lengthSquared,
    0,
    1,
  );
  return Math.hypot(
    pointX - (startX + segmentX * amount),
    pointY - (startY + segmentY * amount),
  );
}

export type SaveState = "saving" | "saved" | "error";

export interface AppProps {
  initialProject?: MotionProject;
  onProjectChange?: (project: MotionProject) => void;
  onBack?: () => void;
  isPublished?: boolean;
  onPublish?: (project: MotionProject) => Promise<void>;
  saveState?: SaveState;
}

export function App({
  initialProject: providedProject,
  onProjectChange,
  onBack,
  isPublished = false,
  onPublish,
  saveState = "saved",
}: AppProps = {}) {
  const initialProject = useMemo(
    () => providedProject ? copyProject(providedProject) : loadInitialProject(),
    [providedProject],
  );
  const [project, setProjectState] = useState<MotionProject>(initialProject);
  const projectRef = useRef(project);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState(initialProject.keyframes[0].id);
  const [selectedJoint, setSelectedJoint] = useState<number | null>(25);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(
    initialProject.annotations[0]?.id ?? null,
  );
  const [selectedConnectionKey, setSelectedConnectionKey] = useState<string | null>(null);
  const [shiftSelectedJoints, setShiftSelectedJoints] = useState<number[]>([]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("pose");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sprite, setSprite] = useState<HTMLImageElement | null>(null);
  const [spriteError, setSpriteError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [gifSettings, setGifSettings] = useState({ size: 480, fps: 12 });
  const [gifProgress, setGifProgress] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [anglePresetId, setAnglePresetId] = useState(ANGLE_PRESETS[0].id);
  const [historyVersion, setHistoryVersion] = useState(0);
  const historyRef = useRef<{ past: MotionProject[]; future: MotionProject[] }>({
    past: [],
    future: [],
  });
  const dragRef = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const noticeTimerRef = useRef<number | null>(null);

  projectRef.current = project;

  const selectedKeyframe = useMemo(
    () => project.keyframes.find((frame) => frame.id === selectedKeyframeId) ?? project.keyframes[0],
    [project.keyframes, selectedKeyframeId],
  );
  const selectedAnnotation = useMemo(
    () => project.annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null,
    [project.annotations, selectedAnnotationId],
  );
  const selectedConnection = useMemo(
    () => project.skeleton.connections.find(
      (connection) => connectionKey(connection) === selectedConnectionKey,
    ) ?? null,
    [project.skeleton.connections, selectedConnectionKey],
  );
  const restoreCandidate = useMemo(
    () => findRestorableConnection(
      shiftSelectedJoints,
      project.skeleton.connections,
    ),
    [project.skeleton.connections, shiftSelectedJoints],
  );
  const shiftSelectionHasActiveConnection = useMemo(() => {
    if (shiftSelectedJoints.length !== 2) return false;
    const key = connectionKey([shiftSelectedJoints[0], shiftSelectedJoints[1]]);
    return project.skeleton.connections.some(
      (connection) => connectionKey(connection) === key,
    );
  }, [project.skeleton.connections, shiftSelectedJoints]);
  const currentPoints = useMemo(
    () => interpolatePose(project, playheadMs),
    [project, playheadMs],
  );
  const selectedJointDefinition = selectedJoint === null ? null : JOINT_BY_INDEX.get(selectedJoint) ?? null;
  const referenceTrainingExercise = EXERCISES.find(
    (exercise) => exercise.id === project.reference.exerciseId,
  );
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  const showNotice = useCallback((message: string) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 2_800);
  }, []);

  const replaceProject = useCallback((next: MotionProject, recordHistory = true) => {
    const current = projectRef.current;
    if (recordHistory) {
      const history = historyRef.current;
      history.past.push(current);
      if (history.past.length > HISTORY_LIMIT) history.past.shift();
      history.future = [];
      setHistoryVersion((version) => version + 1);
    }
    projectRef.current = next;
    setProjectState(next);
  }, []);

  const commitProject = useCallback(
    (updater: (current: MotionProject) => MotionProject) => {
      const current = projectRef.current;
      const next = updater(current);
      if (next !== current) replaceProject(next);
    },
    [replaceProject],
  );

  const removeConnection = useCallback((key: string) => {
    let removed: BoneConnection | null = null;
    commitProject((current) => {
      const connection = current.skeleton.connections.find(
        (candidate) => connectionKey(candidate) === key,
      );
      if (!connection) return current;
      removed = connection;
      return {
        ...current,
        skeleton: {
          connections: current.skeleton.connections.filter(
            (candidate) => connectionKey(candidate) !== key,
          ),
        },
      };
    });
    setSelectedConnectionKey(null);
    if (removed) showNotice(`已移除 ${connectionLabel(removed)}`);
  }, [commitProject, showNotice]);

  const restoreConnection = useCallback((connection: BoneConnection) => {
    const key = connectionKey(connection);
    commitProject((current) => {
      if (current.skeleton.connections.some((candidate) => connectionKey(candidate) === key)) {
        return current;
      }
      return {
        ...current,
        skeleton: {
          connections: [...current.skeleton.connections, [...connection]],
        },
      };
    });
    setSelectedConnectionKey(key);
    setSelectedJoint(null);
    setSelectedAnnotationId(null);
    setShiftSelectedJoints([]);
    showNotice(`已恢复 ${connectionLabel(connection)}`);
  }, [commitProject, showNotice]);

  const updateProjectLive = useCallback((updater: (current: MotionProject) => MotionProject) => {
    const next = updater(projectRef.current);
    projectRef.current = next;
    setProjectState(next);
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    history.future.push(projectRef.current);
    projectRef.current = previous;
    setProjectState(previous);
    setPlayheadMs((time) => Math.min(time, previous.durationMs));
    setHistoryVersion((version) => version + 1);
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return;
    history.past.push(projectRef.current);
    projectRef.current = next;
    setProjectState(next);
    setPlayheadMs((time) => Math.min(time, next.durationMs));
    setHistoryVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => setSprite(image);
    image.onerror = () => setSpriteError(true);
    image.src = huskySpriteUrl;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [project]);

  useEffect(() => {
    onProjectChange?.(project);
  }, [onProjectChange, project]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const render = () => {
      const bounds = stage.getBoundingClientRect();
      const size = Math.max(1, Math.floor(Math.min(bounds.width, bounds.height)));
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const pixelSize = Math.round(size * pixelRatio);
      if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
        canvas.width = pixelSize;
        canvas.height = pixelSize;
      }
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawScene(context, project, playheadMs, sprite, size, size, {
        selectedJoint,
        shiftSelectedJoints,
        selectedAnnotationId,
        selectedConnectionKey,
        restoreCandidate,
      });
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [playheadMs, project, restoreCandidate, selectedAnnotationId, selectedConnectionKey, selectedJoint, shiftSelectedJoints, sprite]);

  useEffect(() => {
    if (!playing) return;
    let animationFrame = 0;
    const startedAt = performance.now() - playheadMs;
    const tick = (timestamp: number) => {
      const elapsed = timestamp - startedAt;
      if (elapsed >= project.durationMs && !project.loop) {
        setPlayheadMs(project.durationMs);
        setPlaying(false);
        return;
      }
      setPlayheadMs(project.loop ? elapsed % project.durationMs : elapsed);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing, project.durationMs, project.loop]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.matches("input, select, textarea, [contenteditable='true']") ?? false;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.code === "Space" && !editingText) {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !editingText &&
        selectedConnectionKey
      ) {
        event.preventDefault();
        removeConnection(selectedConnectionKey);
      } else if (event.key === "Escape" && !editingText) {
        setShiftSelectedJoints([]);
        setSelectedConnectionKey(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, removeConnection, selectedConnectionKey, undo]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  function selectKeyframe(frame: PoseKeyframe): void {
    setPlaying(false);
    setSelectedKeyframeId(frame.id);
    setPlayheadMs(frame.timeMs);
  }

  function updateSelectedFrame(updater: (frame: PoseKeyframe) => PoseKeyframe): void {
    commitProject((current) => ({
      ...current,
      keyframes: current.keyframes.map((frame) =>
        frame.id === selectedKeyframeId ? updater(frame) : frame,
      ),
    }));
  }

  function handleAddKeyframe(): void {
    const frame = addKeyframeAt(projectRef.current, playheadMs);
    commitProject((current) => ({ ...current, keyframes: [...current.keyframes, frame] }));
    setSelectedKeyframeId(frame.id);
    setPlaying(false);
    showNotice(`已在 ${formatTime(frame.timeMs)} 添加关键帧`);
  }

  function handleDeleteKeyframe(): void {
    if (project.keyframes.length <= 1) {
      showNotice("至少保留一个关键帧");
      return;
    }
    const frames = sortedKeyframes(project.keyframes);
    const currentIndex = frames.findIndex((frame) => frame.id === selectedKeyframeId);
    const fallback = currentIndex > 0 ? frames[currentIndex - 1] : frames[1];
    commitProject((current) => ({
      ...current,
      keyframes: current.keyframes.filter((frame) => frame.id !== selectedKeyframeId),
    }));
    setSelectedKeyframeId(fallback.id);
    setPlayheadMs(fallback.timeMs);
  }

  function handleDurationChange(durationMs: number): void {
    const nextDuration = clamp(Math.round(durationMs), 300, 30_000);
    commitProject((current) => {
      const ratio = nextDuration / current.durationMs;
      return {
        ...current,
        durationMs: nextDuration,
        keyframes: current.keyframes.map((frame) => ({
          ...frame,
          timeMs: Math.round(frame.timeMs * ratio),
        })),
      };
    });
    setPlayheadMs((time) => Math.min(time, nextDuration));
  }

  function resetFromExercise(exerciseId: ExerciseId): void {
    const next = createMotionProject(exerciseId);
    next.name = projectRef.current.name;
    replaceProject(next);
    setSelectedKeyframeId(next.keyframes[0].id);
    setSelectedAnnotationId(next.annotations[0]?.id ?? null);
    setSelectedJoint(25);
    setSelectedConnectionKey(null);
    setShiftSelectedJoints([]);
    setPlayheadMs(0);
    setPlaying(false);
    showNotice(`已载入${getExercise(exerciseId).label}模板`);
  }

  function addAngleAnnotation(): void {
    const preset = ANGLE_PRESETS.find((item) => item.id === anglePresetId) ?? ANGLE_PRESETS[0];
    const annotation = createAnnotation(preset);
    commitProject((current) => ({
      ...current,
      annotations: [...current.annotations, annotation],
      display: { ...current.display, angles: true },
    }));
    setSelectedAnnotationId(annotation.id);
    setInspectorTab("annotations");
  }

  function updateSelectedAnnotation(updater: (annotation: AngleAnnotation) => AngleAnnotation): void {
    if (!selectedAnnotationId) return;
    commitProject((current) => ({
      ...current,
      annotations: current.annotations.map((annotation) =>
        annotation.id === selectedAnnotationId ? updater(annotation) : annotation,
      ),
    }));
  }

  function deleteSelectedAnnotation(): void {
    if (!selectedAnnotationId) return;
    const remaining = project.annotations.filter((annotation) => annotation.id !== selectedAnnotationId);
    commitProject((current) => ({ ...current, annotations: remaining }));
    setSelectedAnnotationId(remaining[0]?.id ?? null);
  }

  function canvasPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      nx: (event.clientX - bounds.left) / bounds.width,
      ny: (event.clientY - bounds.top) / bounds.height,
      width: bounds.width,
      height: bounds.height,
    };
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0 || gifProgress) return;
    event.currentTarget.focus();
    setPlaying(false);
    const position = canvasPosition(event);
    const points = interpolatePose(projectRef.current, playheadMs);

    for (const annotation of event.shiftKey ? [] : projectRef.current.annotations) {
      const geometry = getAngleGeometry(annotation, points, position.width, position.height);
      if (geometry && Math.hypot(position.x - geometry.labelX, position.y - geometry.labelY) <= 30) {
        setSelectedAnnotationId(annotation.id);
        setSelectedConnectionKey(null);
        setShiftSelectedJoints([]);
        setInspectorTab("annotations");
        dragRef.current = {
          type: "angle",
          snapshot: projectRef.current,
          changed: false,
          annotationId: annotation.id,
          pointerStart: { x: position.nx, y: position.ny },
          offsetStart: { ...annotation.labelOffset },
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }

    if (restoreCandidate && !event.shiftKey) {
      const start = points[restoreCandidate[0]];
      const end = points[restoreCandidate[1]];
      if (start && end) {
        const distance = pointToSegmentDistance(
          position.x,
          position.y,
          start.x * position.width,
          start.y * position.height,
          end.x * position.width,
          end.y * position.height,
        );
        if (distance <= 18) return;
      }
    }

    let nearestIndex = -1;
    let nearestDistance = 24;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      if (!point || (point.visibility ?? 0) < 0.5) continue;
      const distance = Math.hypot(position.x - point.x * position.width, position.y - point.y * position.height);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    if (nearestIndex >= 0) {
      if (event.shiftKey) {
        setShiftSelectedJoints((current) => {
          if (current.includes(nearestIndex)) {
            return current.filter((index) => index !== nearestIndex);
          }
          return current.length >= 2
            ? [nearestIndex]
            : [...current, nearestIndex];
        });
        setSelectedJoint(nearestIndex);
        setSelectedConnectionKey(null);
        setSelectedAnnotationId(null);
        setInspectorTab("pose");
        return;
      }
      const nearestFrame = projectRef.current.keyframes.reduce((nearest, frame) =>
        Math.abs(frame.timeMs - playheadMs) < Math.abs(nearest.timeMs - playheadMs) ? frame : nearest,
      );
      setSelectedKeyframeId(nearestFrame.id);
      setPlayheadMs(nearestFrame.timeMs);
      setSelectedJoint(nearestIndex);
      setSelectedConnectionKey(null);
      setShiftSelectedJoints([]);
      setInspectorTab("pose");
      dragRef.current = {
        type: "joint",
        snapshot: projectRef.current,
        changed: false,
        jointIndex: nearestIndex,
        keyframeId: nearestFrame.id,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    let nearestConnection: BoneConnection | null = null;
    let connectionDistance = 14;
    for (const connection of projectRef.current.skeleton.connections) {
      const start = points[connection[0]];
      const end = points[connection[1]];
      if (
        !start || !end ||
        (start.visibility ?? 0) < 0.5 ||
        (end.visibility ?? 0) < 0.5
      ) continue;
      const distance = pointToSegmentDistance(
        position.x,
        position.y,
        start.x * position.width,
        start.y * position.height,
        end.x * position.width,
        end.y * position.height,
      );
      if (distance < connectionDistance) {
        connectionDistance = distance;
        nearestConnection = connection;
      }
    }

    if (nearestConnection) {
      setSelectedConnectionKey(connectionKey(nearestConnection));
      setSelectedJoint(null);
      setSelectedAnnotationId(null);
      setShiftSelectedJoints([]);
      setInspectorTab("pose");
      return;
    }
    setSelectedConnectionKey(null);
  }

  function handleCanvasDoubleClick(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!restoreCandidate) return;
    const position = canvasPosition(event);
    const points = interpolatePose(projectRef.current, playheadMs);
    const start = points[restoreCandidate[0]];
    const end = points[restoreCandidate[1]];
    if (!start || !end) return;
    const distance = pointToSegmentDistance(
      position.x,
      position.y,
      start.x * position.width,
      start.y * position.height,
      end.x * position.width,
      end.y * position.height,
    );
    if (distance <= 18) restoreConnection(restoreCandidate);
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    const position = canvasPosition(event);
    if (drag.type === "joint" && drag.jointIndex !== undefined) {
      const frameId = drag.keyframeId ?? selectedKeyframeId;
      const jointIndex = drag.jointIndex;
      updateProjectLive((current) => ({
        ...current,
        keyframes: current.keyframes.map((frame) => {
          if (frame.id !== frameId) return frame;
          const points = clonePoints(frame.points);
          points[jointIndex] = {
            ...points[jointIndex],
            x: clamp(position.nx, 0.015, 0.985),
            y: clamp(position.ny, 0.015, 0.985),
            visibility: 1,
          };
          return { ...frame, points };
        }),
      }));
      drag.changed = true;
    } else if (
      drag.type === "angle" &&
      drag.annotationId &&
      drag.pointerStart &&
      drag.offsetStart
    ) {
      const offset = {
        x: clamp(drag.offsetStart.x + position.nx - drag.pointerStart.x, -0.4, 0.4),
        y: clamp(drag.offsetStart.y + position.ny - drag.pointerStart.y, -0.4, 0.4),
      };
      updateProjectLive((current) => ({
        ...current,
        annotations: current.annotations.map((annotation) =>
          annotation.id === drag.annotationId ? { ...annotation, labelOffset: offset } : annotation,
        ),
      }));
      drag.changed = true;
    }
  }

  function finishCanvasDrag(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.changed) {
      const history = historyRef.current;
      history.past.push(drag.snapshot);
      if (history.past.length > HISTORY_LIMIT) history.past.shift();
      history.future = [];
      setHistoryVersion((version) => version + 1);
    }
    dragRef.current = null;
  }

  function exportJson(): void {
    const contents = JSON.stringify(projectRef.current, null, 2);
    downloadBlob(
      new Blob([contents], { type: "application/json;charset=utf-8" }),
      `${safeFilename(projectRef.current.name)}.motion.json`,
    );
    showNotice("JSON 已导出");
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const next = parseMotionProject(JSON.parse(await file.text()));
      replaceProject(next);
      const first = sortedKeyframes(next.keyframes)[0];
      setSelectedKeyframeId(first.id);
      setSelectedAnnotationId(next.annotations[0]?.id ?? null);
      setSelectedConnectionKey(null);
      setShiftSelectedJoints([]);
      setPlayheadMs(first.timeMs);
      setPlaying(false);
      showNotice("动作项目已导入");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "导入失败");
    }
  }

  async function exportGif(): Promise<void> {
    if (!sprite || gifProgress) return;
    setPlaying(false);
    const snapshot = copyProject(projectRef.current);
    const frameCount = Math.min(
      240,
      Math.max(2, Math.ceil((snapshot.durationMs / 1_000) * gifSettings.fps)),
    );
    const delayMs = snapshot.durationMs / frameCount;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = gifSettings.size;
    exportCanvas.height = gifSettings.size;
    const context = exportCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      showNotice("浏览器无法创建 GIF 画布");
      return;
    }

    try {
      setGifProgress("准备编码器…");
      const { encodeGif, rgbaToIndexed } = await import("./lib/gif-encoder");
      const frames: Array<{ pixels: Uint8Array; delayMs: number }> = [];
      for (let index = 0; index < frameCount; index += 1) {
        const timeMs = (index / frameCount) * snapshot.durationMs;
        drawScene(
          context,
          snapshot,
          timeMs,
          sprite,
          gifSettings.size,
          gifSettings.size,
          { clean: true },
        );
        const rgba = context.getImageData(0, 0, gifSettings.size, gifSettings.size).data;
        frames.push({ pixels: rgbaToIndexed(rgba), delayMs });
        if (index % 2 === 0 || index === frameCount - 1) {
          setGifProgress(`正在生成 ${index + 1} / ${frameCount}`);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      }
      setGifProgress("正在压缩 GIF…");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const bytes = encodeGif({
        width: gifSettings.size,
        height: gifSettings.size,
        frames,
        loop: snapshot.loop,
      });
      const gifBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(gifBuffer).set(bytes);
      downloadBlob(new Blob([gifBuffer], { type: "image/gif" }), `${safeFilename(snapshot.name)}.gif`);
      showNotice(`GIF 已导出 · ${frameCount} 帧`);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "GIF 导出失败");
    } finally {
      setGifProgress(null);
    }
  }

  async function publishProject(): Promise<void> {
    if (!onPublish || publishing) return;
    setPublishing(true);
    try {
      await onPublish(copyProject(projectRef.current));
      showNotice("已发布到 Web 与小程序共享动作数据");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  }

  const selectedAngleDegrees = useMemo(() => {
    if (!selectedAnnotation) return null;
    const start = currentPoints[selectedAnnotation.startIndex];
    const vertex = currentPoints[selectedAnnotation.vertexIndex];
    const end = currentPoints[selectedAnnotation.endIndex];
    if (!start || !vertex || !end) return null;
    return jointAngle(start, vertex, end, project.canvas);
  }, [currentPoints, project.canvas, selectedAnnotation]);

  const selectedFramePoint = selectedJoint === null ? null : selectedKeyframe.points[selectedJoint];
  const historyKey = historyVersion;

  return (
    <main className="motion-app">
      <header className="topbar">
        <button className="brand-lockup brand-button" onClick={onBack} aria-label="返回动作列表" title="返回动作列表">
          <Icon name="back" size={16} />
          <span className="brand-mark"><span /></span>
          <div>
            <strong>FORM BEAT</strong>
            <span>MOTION LAB</span>
          </div>
        </button>

        <label className="project-name-field">
          <span>项目</span>
          <input
            value={project.name}
            onChange={(event) => commitProject((current) => ({ ...current, name: event.target.value }))}
            aria-label="项目名称"
          />
          <i className={`save-state is-${saveState}`}>
            {saveState === "saving" ? "保存中" : saveState === "error" ? "保存失败" : "已保存"}
          </i>
        </label>

        <div className="topbar-actions" data-history={historyKey}>
          <div className="history-actions" aria-label="历史记录">
            <button className="icon-button" onClick={undo} disabled={!canUndo} title="撤销 ⌘Z">
              <Icon name="undo" />
            </button>
            <button className="icon-button" onClick={redo} disabled={!canRedo} title="重做 ⇧⌘Z">
              <Icon name="redo" />
            </button>
          </div>
          <button className="button button-ghost" onClick={() => importInputRef.current?.click()}>
            <Icon name="file" /> 导入
          </button>
          <button className="button button-ghost" onClick={exportJson}>
            <Icon name="download" /> JSON
          </button>
          {onPublish ? (
            <button
              className="button button-ghost"
              onClick={() => void publishProject()}
              disabled={publishing || saveState === "saving"}
            >
              {publishing ? <span className="spinner" /> : <Icon name="frames" />}
              {publishing ? "发布中" : isPublished ? "重新发布" : "发布到客户端"}
            </button>
          ) : null}
          <button className="button button-accent" onClick={exportGif} disabled={!sprite || !!gifProgress}>
            {gifProgress ? <span className="spinner" /> : <Icon name="image" />}
            {gifProgress ?? "导出 GIF"}
          </button>
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={importJson}
            tabIndex={-1}
          />
        </div>
      </header>

      <section className="workspace">
        <aside className="toolrail" aria-label="显示工具">
          <button
            className={`tool-button ${project.display.skeleton ? "is-active" : ""}`}
            onClick={() => commitProject((current) => ({
              ...current,
              display: { ...current.display, skeleton: !current.display.skeleton },
            }))}
            title="显示骨骼"
          >
            <Icon name="skeleton" size={20} />
            <span>骨骼</span>
          </button>
          <button
            className={`tool-button ${project.display.angles ? "is-active" : ""}`}
            onClick={() => commitProject((current) => ({
              ...current,
              display: { ...current.display, angles: !current.display.angles },
            }))}
            title="显示角度"
          >
            <Icon name="angle" size={20} />
            <span>角度</span>
          </button>
          <button
            className={`tool-button ${project.reference.visible ? "is-active" : ""}`}
            onClick={() => commitProject((current) => ({
              ...current,
              reference: { ...current.reference, visible: !current.reference.visible },
            }))}
            title="显示哈士奇参考图"
          >
            <Icon name="image" size={20} />
            <span>参考</span>
          </button>
          <div className="toolrail-spacer" />
          <div className="autosave-indicator"><span /> 已保存</div>
        </aside>

        <section className="stage-column">
          <div className="stage-meta">
            <div>
              <span className="eyebrow">POSE CANVAS</span>
              <strong>{getCatalogExerciseLabel(project.reference.exerciseId)} · {selectedKeyframe.name}</strong>
            </div>
            <div className="stage-state">
              <span className="live-dot" />
              {selectedConnection
                ? `已选择 ${connectionLabel(selectedConnection)} · Delete 移除`
                : restoreCandidate
                  ? `双击虚线恢复 ${connectionLabel(restoreCandidate)}`
                  : shiftSelectedJoints.length === 1
                    ? `已选 ${JOINT_BY_INDEX.get(shiftSelectedJoints[0])?.label ?? "关节"} · Shift 选择第二点`
                : selectedJointDefinition
                  ? `正在编辑 ${selectedJointDefinition.label}`
                  : "选择关节或骨骼线段"}
            </div>
          </div>

          <div className="canvas-well">
            <div className="canvas-stage" ref={stageRef}>
              <canvas
                ref={canvasRef}
                className={dragRef.current ? "is-dragging" : ""}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={finishCanvasDrag}
                onPointerCancel={finishCanvasDrag}
                onDoubleClick={handleCanvasDoubleClick}
                tabIndex={0}
                aria-label="动作骨骼编辑画布。拖动关节调整姿势，选择骨骼线段后按 Delete 移除。"
              />
              {spriteError ? <p className="canvas-error">哈士奇素材加载失败</p> : null}
            </div>
            <div className="canvas-hint">
              <span>拖动关节改变姿势</span>
              <span>选择线段后按 Delete 移除</span>
              <span className="reference-note">Shift 选两点，双击虚线恢复</span>
            </div>
          </div>

          <div className="transport">
            <button
              className="transport-play"
              onClick={() => {
                if (!playing && playheadMs >= project.durationMs) setPlayheadMs(0);
                setPlaying((value) => !value);
              }}
              aria-label={playing ? "暂停" : "播放"}
            >
              <Icon name={playing ? "pause" : "play"} size={19} />
            </button>
            <span className="transport-time">{formatTime(playheadMs)}</span>
            <input
              className="transport-scrubber"
              type="range"
              min={0}
              max={project.durationMs}
              step={1}
              value={playheadMs}
              onChange={(event) => {
                setPlaying(false);
                setPlayheadMs(Number(event.target.value));
              }}
              aria-label="播放位置"
              style={{ "--progress": `${(playheadMs / project.durationMs) * 100}%` } as CSSProperties}
            />
            <span className="transport-time muted">{formatTime(project.durationMs)}</span>
            <button className={`loop-button ${project.loop ? "is-active" : ""}`} onClick={() => commitProject((current) => ({ ...current, loop: !current.loop }))}>
              循环
            </button>
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-tabs" role="tablist" aria-label="属性面板">
            {([
              ["pose", "姿态"],
              ["annotations", "标注"],
              ["project", "项目"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={inspectorTab === id}
                className={inspectorTab === id ? "is-active" : ""}
                onClick={() => setInspectorTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="inspector-body">
            {inspectorTab === "pose" ? (
              <>
                <section className="property-section">
                  <div className="section-heading">
                    <div>
                      <span>关键帧</span>
                      <strong>{selectedKeyframe.name}</strong>
                    </div>
                    <span className="frame-index">#{sortedKeyframes(project.keyframes).findIndex((frame) => frame.id === selectedKeyframe.id) + 1}</span>
                  </div>
                  <label className="field">
                    <span>名称</span>
                    <input value={selectedKeyframe.name} onChange={(event) => updateSelectedFrame((frame) => ({ ...frame, name: event.target.value }))} />
                  </label>
                  <div className="field-grid">
                    <label className="field">
                      <span>时间（ms）</span>
                      <input
                        type="number"
                        min={0}
                        max={project.durationMs}
                        value={selectedKeyframe.timeMs}
                        onChange={(event) => {
                          const timeMs = clamp(Number(event.target.value), 0, project.durationMs);
                          updateSelectedFrame((frame) => ({ ...frame, timeMs }));
                          setPlayheadMs(timeMs);
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>参考画面</span>
                      <select value={selectedKeyframe.referenceFrame} onChange={(event) => updateSelectedFrame((frame) => ({ ...frame, referenceFrame: Number(event.target.value) as 0 | 1 }))}>
                        <option value={0}>姿势 A</option>
                        <option value={1}>姿势 B</option>
                      </select>
                    </label>
                  </div>
                </section>

                {selectedConnection ? (
                  <section className="property-section connection-inspector">
                    <div className="section-title-row">
                      <span className="section-title">骨骼线段</span>
                      <span className="selection-chip">已选择</span>
                    </div>
                    <div className="connection-summary">
                      <span className="connection-line-swatch" />
                      <div>
                        <strong>{connectionLabel(selectedConnection)}</strong>
                        <small>{selectedConnection[0]} ↔ {selectedConnection[1]}</small>
                      </div>
                    </div>
                    <button
                      className="button button-wide connection-delete"
                      onClick={() => removeConnection(connectionKey(selectedConnection))}
                    >
                      <Icon name="trash" /> 移除线段
                    </button>
                    <p className="helper-copy">也可以直接按 Delete 或 Backspace。移除会作用于整个动作。</p>
                  </section>
                ) : (
                  <section className="property-section joint-inspector">
                    <div className="section-title-row">
                      <span className="section-title">关节坐标</span>
                      {selectedJointDefinition ? <span className="selection-chip">{selectedJointDefinition.label}</span> : null}
                    </div>
                    {selectedFramePoint && selectedJoint !== null ? (
                      <>
                        <div className="coordinate-readout">
                          <label><span>X</span><input type="number" min={0} max={1} step={0.001} value={selectedFramePoint.x.toFixed(3)} onChange={(event) => {
                            const value = clamp(Number(event.target.value), 0, 1);
                            updateSelectedFrame((frame) => {
                              const points = clonePoints(frame.points);
                              points[selectedJoint] = { ...points[selectedJoint], x: value };
                              return { ...frame, points };
                            });
                          }} /></label>
                          <label><span>Y</span><input type="number" min={0} max={1} step={0.001} value={selectedFramePoint.y.toFixed(3)} onChange={(event) => {
                            const value = clamp(Number(event.target.value), 0, 1);
                            updateSelectedFrame((frame) => {
                              const points = clonePoints(frame.points);
                              points[selectedJoint] = { ...points[selectedJoint], y: value };
                              return { ...frame, points };
                            });
                          }} /></label>
                        </div>
                        <div className="nudge-pad" aria-label="微调关节位置">
                          <button onClick={() => nudgeSelectedJoint(0, -0.002)} aria-label="向上微调">↑</button>
                          <button onClick={() => nudgeSelectedJoint(-0.002, 0)} aria-label="向左微调">←</button>
                          <button onClick={() => nudgeSelectedJoint(0.002, 0)} aria-label="向右微调">→</button>
                          <button onClick={() => nudgeSelectedJoint(0, 0.002)} aria-label="向下微调">↓</button>
                          <span>每次 0.2%</span>
                        </div>
                      </>
                    ) : <p className="empty-copy">点击画布上的关节或骨骼线段开始编辑。</p>}
                  </section>
                )}

                <section className="property-section restore-workflow">
                  <div className="section-title-row">
                    <span className="section-title">恢复连线</span>
                    <kbd className="shift-key">Shift</kbd>
                  </div>
                  <div className={`restore-selection-status ${restoreCandidate ? "is-ready" : ""}`}>
                    {shiftSelectedJoints.length === 0 ? (
                      <p>按住 Shift，依次点击两个关节点。</p>
                    ) : (
                      <div className="restore-joint-pair">
                        {shiftSelectedJoints.map((index) => (
                          <span className="joint-token" key={index}>
                            {JOINT_BY_INDEX.get(index)?.shortLabel ?? index}
                          </span>
                        ))}
                        {shiftSelectedJoints.length === 1 ? <i>选择第二点</i> : null}
                      </div>
                    )}
                    {restoreCandidate ? (
                      <div className="restore-ready-message">
                        <span className="virtual-connection-icon" />
                        <div>
                          <strong>{connectionLabel(restoreCandidate)}</strong>
                          <small>双击画布中的虚线恢复</small>
                        </div>
                      </div>
                    ) : null}
                    {shiftSelectedJoints.length === 2 && shiftSelectionHasActiveConnection ? (
                      <p className="restore-result-message">这两个关节目前已有连线。</p>
                    ) : null}
                    {shiftSelectedJoints.length === 2 && !shiftSelectionHasActiveConnection && !restoreCandidate ? (
                      <p className="restore-result-message is-invalid">这两个关节之间没有可恢复的历史连线。</p>
                    ) : null}
                  </div>
                  {shiftSelectedJoints.length > 0 ? (
                    <button className="clear-selection-button" onClick={() => setShiftSelectedJoints([])}>
                      清除选择 <span>Esc</span>
                    </button>
                  ) : null}
                </section>

                <section className="property-section danger-row">
                  <button className="text-button danger" onClick={handleDeleteKeyframe}><Icon name="trash" /> 删除关键帧</button>
                </section>
              </>
            ) : null}

            {inspectorTab === "annotations" ? (
              <>
                <section className="property-section">
                  <span className="section-title">新增角度标注</span>
                  <div className="add-annotation-row">
                    <select value={anglePresetId} onChange={(event) => setAnglePresetId(event.target.value)}>
                      {ANGLE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                    <button className="square-add" onClick={addAngleAnnotation} aria-label="添加角度标注"><Icon name="plus" /></button>
                  </div>
                </section>

                <section className="annotation-list" aria-label="角度标注列表">
                  {project.annotations.map((annotation) => {
                    const geometry = getAngleGeometry(annotation, currentPoints, project.canvas.width, project.canvas.height);
                    return (
                      <button
                        key={annotation.id}
                        className={`annotation-row ${annotation.id === selectedAnnotationId ? "is-active" : ""}`}
                        onClick={() => {
                          setSelectedAnnotationId(annotation.id);
                          setSelectedConnectionKey(null);
                        }}
                      >
                        <span className="annotation-symbol"><Icon name="angle" size={16} /></span>
                        <span><strong>{annotation.label}</strong><small>{JOINT_BY_INDEX.get(annotation.vertexIndex)?.label ?? `关节 ${annotation.vertexIndex}`}</small></span>
                        <b>{geometry ? `${Math.round(geometry.degrees)}°` : "—"}</b>
                        <Icon name="chevron" size={15} />
                      </button>
                    );
                  })}
                  {project.annotations.length === 0 ? <p className="empty-copy roomy">还没有标注。选择上方预设即可添加。</p> : null}
                </section>

                {selectedAnnotation ? (
                  <section className="property-section annotation-editor">
                    <div className="section-heading">
                      <div><span>选中标注</span><strong>{selectedAngleDegrees === null ? "—" : `${Math.round(selectedAngleDegrees)}°`}</strong></div>
                      <button className="icon-button danger" onClick={deleteSelectedAnnotation} title="删除标注"><Icon name="trash" /></button>
                    </div>
                    <label className="field"><span>名称</span><input value={selectedAnnotation.label} onChange={(event) => updateSelectedAnnotation((annotation) => ({ ...annotation, label: event.target.value }))} /></label>
                    <label className="range-field">
                      <span><b>圆弧半径</b><output>{Math.round(selectedAnnotation.radius * 100)}%</output></span>
                      <input type="range" min={0.025} max={0.12} step={0.0025} value={selectedAnnotation.radius} onChange={(event) => updateSelectedAnnotation((annotation) => ({ ...annotation, radius: Number(event.target.value) }))} />
                    </label>
                    <p className="helper-copy">在画布上拖动角度数字，可精确调整标签位置。</p>
                  </section>
                ) : null}
              </>
            ) : null}

            {inspectorTab === "project" ? (
              <>
                <section className="property-section">
                  <span className="section-title">动作设置</span>
                  <label className="field">
                    <span>参考动作</span>
                    <select value={project.reference.exerciseId} onChange={(event) => commitProject((current) => ({ ...current, reference: { ...current.reference, exerciseId: event.target.value as ExerciseId } }))}>
                      {EXERCISES.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.label}</option>)}
                    </select>
                  </label>
                  <button
                    className="button button-wide button-outline"
                    disabled={!referenceTrainingExercise}
                    onClick={() => {
                      if (referenceTrainingExercise) resetFromExercise(referenceTrainingExercise.id);
                    }}
                  >套用动作模板</button>
                  <label className="field"><span>总时长（ms）</span><input type="number" min={300} max={30000} step={100} value={project.durationMs} onChange={(event) => handleDurationChange(Number(event.target.value))} /></label>
                  <label className="field">
                    <span>补间方式</span>
                    <select value={project.easing} onChange={(event) => commitProject((current) => ({ ...current, easing: event.target.value as MotionProject["easing"] }))}>
                      <option value="ease-in-out">缓入缓出</option>
                      <option value="ease-out">快速发力</option>
                      <option value="linear">匀速</option>
                    </select>
                  </label>
                  <label className="range-field">
                    <span><b>参考图透明度</b><output>{Math.round(project.reference.opacity * 100)}%</output></span>
                    <input type="range" min={0.1} max={1} step={0.01} value={project.reference.opacity} onChange={(event) => commitProject((current) => ({ ...current, reference: { ...current.reference, opacity: Number(event.target.value) } }))} />
                  </label>
                </section>

                <section className="property-section">
                  <span className="section-title">GIF 输出</span>
                  <div className="field-grid">
                    <label className="field"><span>尺寸</span><select value={gifSettings.size} onChange={(event) => setGifSettings((current) => ({ ...current, size: Number(event.target.value) }))}><option value={360}>360 px</option><option value={480}>480 px</option><option value={640}>640 px</option></select></label>
                    <label className="field"><span>帧率</span><select value={gifSettings.fps} onChange={(event) => setGifSettings((current) => ({ ...current, fps: Number(event.target.value) }))}><option value={8}>8 fps</option><option value={12}>12 fps</option><option value={16}>16 fps</option></select></label>
                  </div>
                  <p className="helper-copy">GIF 在本机浏览器生成，不上传动作数据。</p>
                </section>
              </>
            ) : null}
          </div>
        </aside>
      </section>

      <section className="timeline-panel">
        <div className="timeline-sidebar">
          <div>
            <span className="eyebrow">TIMELINE</span>
            <strong>{project.keyframes.length} 个关键帧</strong>
          </div>
          <button className="button button-dark" onClick={handleAddKeyframe}><Icon name="plus" /> 当前处添加</button>
        </div>
        <div className="timeline-main">
          <div className="timeline-ruler" aria-hidden="true">
            {[0, 0.25, 0.5, 0.75, 1].map((progress) => <span key={progress} style={{ left: `${progress * 100}%` }}>{formatTime(project.durationMs * progress)}</span>)}
          </div>
          <div className="timeline-track-wrap">
            <div className="timeline-grid" aria-hidden="true">{[0, 0.25, 0.5, 0.75, 1].map((progress) => <i key={progress} style={{ left: `${progress * 100}%` }} />)}</div>
            <input
              className="timeline-scrubber"
              type="range"
              min={0}
              max={project.durationMs}
              step={1}
              value={playheadMs}
              onChange={(event) => { setPlaying(false); setPlayheadMs(Number(event.target.value)); }}
              aria-label="时间轴播放头"
            />
            <div className="playhead" style={{ left: `${(playheadMs / project.durationMs) * 100}%` }}><span /></div>
            {sortedKeyframes(project.keyframes).map((frame, index) => (
              <button
                key={frame.id}
                className={`keyframe-marker ${frame.id === selectedKeyframe.id ? "is-active" : ""}`}
                style={{ left: `${(frame.timeMs / project.durationMs) * 100}%` }}
                onClick={() => selectKeyframe(frame)}
                title={`${frame.name} · ${formatTime(frame.timeMs)}`}
              >
                <span className="keyframe-diamond" />
                <small>{index + 1}</small>
              </button>
            ))}
          </div>
          <div className="timeline-caption">
            <span><Icon name="frames" size={14} /> 关键帧之间自动补全</span>
            <span>{project.easing === "linear" ? "匀速" : project.easing === "ease-out" ? "快速发力" : "缓入缓出"}</span>
          </div>
        </div>
      </section>

      {notice ? <div className="notice" role="status"><span />{notice}</div> : null}
      <div className="narrow-screen-warning">Motion Lab 需要至少 900px 宽的桌面窗口。</div>
    </main>
  );

  function nudgeSelectedJoint(deltaX: number, deltaY: number): void {
    if (selectedJoint === null) return;
    updateSelectedFrame((frame) => {
      const points = clonePoints(frame.points);
      const point = points[selectedJoint];
      points[selectedJoint] = {
        ...point,
        x: clamp(point.x + deltaX, 0, 1),
        y: clamp(point.y + deltaY, 0, 1),
      };
      return { ...frame, points };
    });
  }
}
