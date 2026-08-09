import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { ExerciseId } from "../domain/exercises";
import { getExercise } from "../domain/exercises";
import type { AvatarId } from "../domain/records";
import type { CompletionStats } from "../domain/session";
import {
  coverVisibleBounds,
  type NormalizedBounds,
  type PosePoint,
} from "../lib/geometry";
import {
  cancelSpeechPrompt,
  playCompletionCue,
  playRepCue,
  shouldPlayFramingPrompt,
  speakChinesePrompt,
  type SpokenDirection,
} from "../lib/audio";
import {
  applyCameraDevice,
  applyCameraZoom,
  applyWidestCameraView,
  findWiderCameraDevice,
  getCameraZoomOutRange,
  type CameraCandidate,
  type CameraZoomRange,
} from "../lib/camera";
import type {
  PoseDelegate,
  PoseWorkerRequest,
  PoseWorkerResponse,
} from "../lib/pose-worker-types";
import {
  createRepCounterState,
  updateRepCounter,
  type CounterPhase,
  type FramingDirection,
  type PoseAngleOverlay,
} from "../lib/rep-counter";
import {
  createSessionRecorder,
  type CompletedRecording,
  type SessionRecorder,
} from "../lib/session-recorder";

type TrainerStatus =
  | "starting"
  | "loading-model"
  | "requesting-camera"
  | "tracking"
  | "error";

interface UsePoseTrainerOptions {
  exerciseId: ExerciseId;
  target: number;
  avatar: AvatarId;
  onComplete: (
    stats: CompletionStats,
    recording: CompletedRecording | null,
  ) => void | Promise<void>;
}

interface PoseTrainer {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: TrainerStatus;
  modelProgress: number;
  modelVariant: "Lite" | "Full";
  delegate: PoseDelegate | null;
  count: number;
  phase: CounterPhase;
  feedback: string;
  poseVisible: boolean;
  quality: number;
  elapsedSeconds: number;
  paused: boolean;
  soundEnabled: boolean;
  cameraZoom: number;
  cameraZoomRange: CameraZoomRange | null;
  error: string | null;
  retry: () => void;
  togglePaused: () => void;
  toggleSound: () => void;
  setCameraZoom: (zoom: number) => void;
}

const TRACKING_READY_HOLD_MS = 120;
const FRAMING_SPEECH: Record<FramingDirection, SpokenDirection> = {
  forward: "向前",
  backward: "向后",
  left: "向左",
  right: "向右",
};

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

function chooseModelVariant(): "Lite" | "Full" {
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const lowPower =
    navigator.hardwareConcurrency <= 4 ||
    (deviceMemory !== undefined && deviceMemory <= 4);
  return lowPower ? "Lite" : "Full";
}

function smoothLandmarks(
  previous: readonly PosePoint[] | null,
  current: readonly PosePoint[],
  alpha = 0.42,
): PosePoint[] {
  if (!previous || previous.length !== current.length) return current.map((point) => ({ ...point }));

  return current.map((point, index) => {
    const before = previous[index];
    return {
      x: before.x + (point.x - before.x) * alpha,
      y: before.y + (point.y - before.y) * alpha,
      z:
        before.z !== undefined && point.z !== undefined
          ? before.z + (point.z - before.z) * alpha
          : point.z,
      visibility: point.visibility,
    };
  });
}

function shortestAngleSweep(start: number, end: number): number {
  let sweep = end - start;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  return sweep;
}

function roundedRectanglePath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.arcTo(x + width, y, x + width, y + corner, corner);
  context.lineTo(x + width, y + height - corner);
  context.arcTo(x + width, y + height, x + width - corner, y + height, corner);
  context.lineTo(x + corner, y + height);
  context.arcTo(x, y + height, x, y + height - corner, corner);
  context.lineTo(x, y + corner);
  context.arcTo(x, y, x + corner, y, corner);
  context.closePath();
}

function drawAngleOverlay(
  context: CanvasRenderingContext2D,
  landmarks: readonly PosePoint[],
  overlay: PoseAngleOverlay,
  width: number,
  height: number,
): void {
  const startPoint = landmarks[overlay.startIndex];
  const vertexPoint = landmarks[overlay.vertexIndex];
  const endPoint = landmarks[overlay.endIndex];
  if (!startPoint || !vertexPoint || !endPoint) return;
  if (
    Math.min(
      startPoint.visibility ?? 1,
      vertexPoint.visibility ?? 1,
      endPoint.visibility ?? 1,
    ) < 0.55
  ) {
    return;
  }

  const vertexX = vertexPoint.x * width;
  const vertexY = vertexPoint.y * height;
  const startX = startPoint.x * width;
  const startY = startPoint.y * height;
  const endX = endPoint.x * width;
  const endY = endPoint.y * height;
  const startLength = Math.hypot(startX - vertexX, startY - vertexY);
  const endLength = Math.hypot(endX - vertexX, endY - vertexY);
  if (startLength < 1 || endLength < 1) return;

  const unit = Math.min(width, height);
  const radius = Math.min(
    unit * 0.06,
    Math.max(unit * 0.025, Math.min(startLength, endLength) * 0.24),
  );
  const startAngle = Math.atan2(startY - vertexY, startX - vertexX);
  const endAngle = Math.atan2(endY - vertexY, endX - vertexX);
  const sweep = shortestAngleSweep(startAngle, endAngle);

  context.save();
  context.beginPath();
  context.arc(vertexX, vertexY, radius, startAngle, startAngle + sweep, sweep < 0);
  context.lineCap = "round";
  context.lineWidth = Math.max(7, unit * 0.011);
  context.strokeStyle = "rgb(14 15 13 / 86%)";
  context.stroke();
  context.lineWidth = Math.max(3, unit * 0.0055);
  context.strokeStyle = "oklch(91% 0.25 126)";
  context.stroke();

  const fontSize = Math.min(30, Math.max(17, unit * 0.032));
  const labelAngle = startAngle + sweep / 2;
  const labelOffset = radius + fontSize * 1.25;
  const label = `${Math.round(overlay.degrees)}°`;
  context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const labelWidth = context.measureText(label).width + fontSize * 0.85;
  const labelHeight = fontSize * 1.5;
  const margin = labelWidth / 2 + 4;
  const labelX = Math.min(
    width - margin,
    Math.max(margin, vertexX + Math.cos(labelAngle) * labelOffset),
  );
  const labelY = Math.min(
    height - labelHeight / 2 - 4,
    Math.max(labelHeight / 2 + 4, vertexY + Math.sin(labelAngle) * labelOffset),
  );

  // The whole preview is mirrored. Pre-flip glyphs here so both live video and
  // the mirrored local recording keep the number readable.
  context.translate(labelX, labelY);
  context.scale(-1, 1);
  roundedRectanglePath(
    context,
    -labelWidth / 2,
    -labelHeight / 2,
    labelWidth,
    labelHeight,
    labelHeight / 2,
  );
  context.fillStyle = "rgb(14 15 13 / 88%)";
  context.fill();
  context.fillStyle = "oklch(96% 0.015 88)";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 0, fontSize * 0.02);
  context.restore();
}

function drawPose(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: readonly PosePoint[],
  angleOverlays: readonly PoseAngleOverlay[],
  avatar: AvatarId,
): void {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  const drawConnections = (strokeStyle: string, lineWidth: number) => {
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    for (const [startIndex, endIndex] of CONNECTIONS) {
      const start = landmarks[startIndex];
      const end = landmarks[endIndex];
      if (!start || !end) continue;
      if ((start.visibility ?? 1) < 0.5 || (end.visibility ?? 1) < 0.5) continue;
      context.beginPath();
      context.moveTo(start.x * width, start.y * height);
      context.lineTo(end.x * width, end.y * height);
      context.stroke();
    }
  };

  drawConnections("oklch(16% 0.018 75 / 0.8)", Math.max(7, width * 0.009));
  drawConnections("oklch(91% 0.25 126)", Math.max(3, width * 0.0045));

  const radius = Math.max(4, width * 0.006);
  for (const point of landmarks) {
    if ((point.visibility ?? 1) < 0.55) continue;
    context.beginPath();
    context.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
    context.fillStyle = "oklch(70% 0.2 28)";
    context.fill();
    context.lineWidth = Math.max(2, width * 0.0025);
    context.strokeStyle = "oklch(96% 0.015 88)";
    context.stroke();
  }

  if (avatar !== "none") {
    drawAvatar(context, landmarks, width, height, avatar);
  }

  for (const overlay of angleOverlays) {
    drawAngleOverlay(context, landmarks, overlay, width, height);
  }
}

function drawAvatar(
  context: CanvasRenderingContext2D,
  landmarks: readonly PosePoint[],
  width: number,
  height: number,
  avatar: Exclude<AvatarId, "none">,
): void {
  const facePoints = [landmarks[0], landmarks[7], landmarks[8]].filter(
    (point): point is PosePoint => Boolean(point && (point.visibility ?? 1) >= 0.5),
  );
  if (facePoints.length === 0) return;

  const centerX =
    (facePoints.reduce((sum, point) => sum + point.x, 0) / facePoints.length) * width;
  const centerY =
    (facePoints.reduce((sum, point) => sum + point.y, 0) / facePoints.length) * height;
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const shoulderWidth =
    leftShoulder && rightShoulder
      ? Math.hypot(
          (leftShoulder.x - rightShoulder.x) * width,
          (leftShoulder.y - rightShoulder.y) * height,
        )
      : width * 0.18;
  const diameter = Math.min(width * 0.22, Math.max(width * 0.1, shoulderWidth * 0.72));

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, diameter / 2, 0, Math.PI * 2);
  context.fillStyle = "rgba(247, 247, 242, 0.96)";
  context.fill();
  context.lineWidth = Math.max(2, width * 0.003);
  context.strokeStyle = "rgba(23, 24, 19, 0.92)";
  context.stroke();
  context.font = `${diameter * 0.72}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(avatar === "man" ? "👨" : "👩", centerX, centerY + diameter * 0.04);
  context.restore();
}

function clearPose(canvas: HTMLCanvasElement | null): void {
  const context = canvas?.getContext("2d");
  if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
}

function cameraErrorMessage(error: unknown): string {
  if (!window.isSecureContext) {
    return "摄像头只能在 HTTPS 或 localhost 中使用。请通过安全地址重新打开。";
  }
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "相机权限未开启。请在浏览器地址栏的权限设置中允许相机，然后重试。";
    }
    if (error.name === "NotFoundError") {
      return "没有找到可用摄像头。请确认设备已连接摄像头后重试。";
    }
    if (error.name === "NotReadableError") {
      return "摄像头正被其他应用占用。关闭其他相机应用后再试一次。";
    }
  }
  if (error instanceof Error && error.message === "MEDIA_DEVICES_UNAVAILABLE") {
    return "这个浏览器不支持摄像头访问。请使用最新版 Safari、Chrome 或 Edge。";
  }
  return "摄像头启动失败。检查浏览器权限和网络后再试一次。";
}

export function usePoseTrainer({
  exerciseId,
  target,
  avatar,
  onComplete,
}: UsePoseTrainerOptions): PoseTrainer {
  const exercise = getExercise(exerciseId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(false);
  const soundEnabledRef = useRef(true);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const zoomRangeRef = useRef<CameraZoomRange | null>(null);
  const zoomRequestRef = useRef(0);
  const scheduleNextRef = useRef<() => void>(() => undefined);
  const resetSpeechPromptRef = useRef<() => void>(() => undefined);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [status, setStatus] = useState<TrainerStatus>("starting");
  const [modelProgress, setModelProgress] = useState(0);
  const [modelVariant] = useState(chooseModelVariant);
  const [delegate, setDelegate] = useState<PoseDelegate | null>(null);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<CounterPhase>("seeking-start");
  const [feedback, setFeedback] = useState(exercise.readyCue);
  const [poseVisible, setPoseVisible] = useState(false);
  const [quality, setQuality] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cameraZoom, setCameraZoomState] = useState(1);
  const [cameraZoomRange, setCameraZoomRange] =
    useState<CameraZoomRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completeSession = useEffectEvent(onComplete);
  const resumeCameraAfterSpeech = useCallback(() => {
    const video = videoRef.current;
    if (!pausedRef.current && video?.paused) {
      void video.play().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let workerReady = false;
    let cameraReady = false;
    let sessionStartedAt = 0;
    let frameRequest = 0;
    let usesVideoFrameCallback = false;
    let inFlight = false;
    let finished = false;
    let lastTimestamp = 0;
    let visibleBounds: NormalizedBounds | undefined;
    let previousLandmarks: PosePoint[] | null = null;
    let previousWorldLandmarks: PosePoint[] | null = null;
    let qualityTotal = 0;
    let qualityFrames = 0;
    let lastFeedback = exercise.readyCue;
    let lastPoseVisible = false;
    let speechDirection: FramingDirection | null = null;
    let directionSince: number | null = null;
    let lastSpeechPromptAt: number | null = null;
    let lastQualityBucket = 0;
    let lastPhase: CounterPhase = "seeking-start";
    const cameraStreams = new Set<MediaStream>();
    const counter = { current: createRepCounterState() };
    const worker = new Worker(new URL("../workers/pose.worker.ts", import.meta.url), {
      type: "module",
    });

    setStatus("loading-model");
    setModelProgress(0);
    setError(null);
    setCount(0);
    setPhase("seeking-start");
    setFeedback(exercise.readyCue);
    setPoseVisible(false);
    setQuality(0);
    setElapsedSeconds(0);
    videoTrackRef.current = null;
    zoomRangeRef.current = null;
    zoomRequestRef.current += 1;
    setCameraZoomState(1);
    setCameraZoomRange(null);
    pausedRef.current = false;
    setPaused(false);

    const stopFrameRequest = () => {
      const video = videoRef.current;
      if (!frameRequest || !video) return;
      if (usesVideoFrameCallback && "cancelVideoFrameCallback" in video) {
        video.cancelVideoFrameCallback(frameRequest);
      } else {
        cancelAnimationFrame(frameRequest);
      }
      frameRequest = 0;
    };

    const stopMediaStream = (stream: MediaStream) => {
      stream.getTracks().forEach((track) => track.stop());
      cameraStreams.delete(stream);
    };

    const stopCamera = () => {
      const video = videoRef.current;
      const stream = video?.srcObject;
      for (const cameraStream of [...cameraStreams]) {
        stopMediaStream(cameraStream);
      }
      if (stream instanceof MediaStream) stopMediaStream(stream);
      if (video) video.srcObject = null;
    };

    const setStableFeedback = (message: string) => {
      if (message === lastFeedback) return;
      lastFeedback = message;
      setFeedback(message);
    };

    const setStablePoseVisible = (visible: boolean) => {
      if (visible === lastPoseVisible) return;
      lastPoseVisible = visible;
      setPoseVisible(visible);
    };

    const resetSpeechPrompt = () => {
      speechDirection = null;
      directionSince = null;
      lastSpeechPromptAt = null;
      cancelSpeechPrompt();
    };
    resetSpeechPromptRef.current = resetSpeechPrompt;

    const updateVisibleBounds = () => {
      const video = videoRef.current;
      if (
        !video ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0 ||
        video.clientWidth <= 0 ||
        video.clientHeight <= 0
      ) {
        visibleBounds = undefined;
        return;
      }

      visibleBounds = coverVisibleBounds(
        { width: video.videoWidth, height: video.videoHeight },
        { width: video.clientWidth, height: video.clientHeight },
      );
    };

    window.addEventListener("resize", updateVisibleBounds);

    const maybeStart = () => {
      if (!active || !cameraReady || !workerReady || sessionStartedAt !== 0) return;
      sessionStartedAt = performance.now();
      setStatus("tracking");
      setStableFeedback(exercise.readyCue);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
        recorderRef.current = createSessionRecorder(video, canvas);
      }
      scheduleNextRef.current();
    };

    const sendFrame = async () => {
      const video = videoRef.current;
      if (
        !active ||
        finished ||
        pausedRef.current ||
        !workerReady ||
        !cameraReady ||
        inFlight ||
        !video ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return;
      }

      inFlight = true;
      try {
        const bitmap = await createImageBitmap(video);
        if (!active) {
          bitmap.close();
          return;
        }
        const now = performance.now();
        const timestamp = now > lastTimestamp ? now : lastTimestamp + 0.01;
        lastTimestamp = timestamp;
        const message: PoseWorkerRequest = { type: "DETECT", bitmap, timestamp };
        worker.postMessage(message, [bitmap]);
      } catch (bitmapError) {
        console.error("无法读取摄像头画面", bitmapError);
        inFlight = false;
        scheduleNextRef.current();
      }
    };

    const scheduleNext = () => {
      const video = videoRef.current;
      if (!active || finished || pausedRef.current || inFlight || !video) return;
      stopFrameRequest();
      if ("requestVideoFrameCallback" in video) {
        usesVideoFrameCallback = true;
        frameRequest = video.requestVideoFrameCallback(() => {
          frameRequest = 0;
          void sendFrame();
        });
      } else {
        usesVideoFrameCallback = false;
        frameRequest = requestAnimationFrame(() => {
          frameRequest = 0;
          void sendFrame();
        });
      }
    };
    scheduleNextRef.current = scheduleNext;

    const handleResult = (
      message: Extract<PoseWorkerResponse, { type: "RESULT" }>,
    ) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const rawLandmarks = message.landmarks[0];
      const rawWorldLandmarks = message.worldLandmarks[0];
      const landmarks = rawLandmarks
        ? smoothLandmarks(previousLandmarks, rawLandmarks)
        : [];
      const worldLandmarks = rawWorldLandmarks
        ? smoothLandmarks(previousWorldLandmarks, rawWorldLandmarks)
        : [];
      previousLandmarks = landmarks.length ? landmarks : null;
      previousWorldLandmarks = worldLandmarks.length ? worldLandmarks : null;

      const update = updateRepCounter(exerciseId, counter.current, {
        landmarks,
        worldLandmarks,
        size: { width: video.videoWidth, height: video.videoHeight },
        visibleBounds,
        timestamp: message.timestamp,
      });
      counter.current = update.state;
      if (landmarks.length) {
        drawPose(canvas, video, landmarks, update.angleOverlays, avatar);
      } else {
        clearPose(canvas);
      }
      qualityTotal += update.quality;
      qualityFrames += 1;

      const requirementSince = update.requirementsMet
        ? update.state.validSince
        : update.state.invalidSince;
      const requirementHeldFor =
        message.timestamp - (requirementSince ?? message.timestamp);
      const visible = update.requirementsMet
        ? lastPoseVisible || requirementHeldFor >= TRACKING_READY_HOLD_MS
        : lastPoseVisible && requirementHeldFor < TRACKING_READY_HOLD_MS;
      setStablePoseVisible(visible);
      const nextFeedback = landmarks.length
        ? update.feedback
        : exercise.readyCue;
      setStableFeedback(nextFeedback);

      if (update.requirementsMet) {
        if (speechDirection !== null) resetSpeechPrompt();
      } else if (
        update.framingDirection &&
        soundEnabledRef.current &&
        !pausedRef.current &&
        !finished
      ) {
        if (speechDirection !== update.framingDirection) {
          speechDirection = update.framingDirection;
          directionSince = message.timestamp;
          lastSpeechPromptAt = null;
          cancelSpeechPrompt();
        }
        if (
          directionSince !== null &&
          shouldPlayFramingPrompt(
            message.timestamp,
            directionSince,
            lastSpeechPromptAt,
          )
        ) {
          speakChinesePrompt(
            FRAMING_SPEECH[update.framingDirection],
            resumeCameraAfterSpeech,
          );
          lastSpeechPromptAt = message.timestamp;
        }
      } else if (speechDirection !== null) {
        resetSpeechPrompt();
      }
      if (update.state.phase !== lastPhase) {
        lastPhase = update.state.phase;
        setPhase(update.state.phase);
      }
      const qualityBucket = Math.round(update.quality * 10) * 10;
      if (qualityBucket !== lastQualityBucket) {
        lastQualityBucket = qualityBucket;
        setQuality(qualityBucket);
      }

      if (update.didCount) {
        const nextCount = update.state.count;
        setCount(nextCount);
        if (soundEnabledRef.current) playRepCue(nextCount);

        if (nextCount >= target && !finished) {
          finished = true;
          stopFrameRequest();
          resetSpeechPrompt();
          const durationSeconds = Math.max(
            1,
            Math.round((message.timestamp - sessionStartedAt) / 1_000),
          );
          if (soundEnabledRef.current) {
            window.setTimeout(playCompletionCue, 190);
          }
          const stats: CompletionStats = {
            completedReps: nextCount,
            targetReps: target,
            durationSeconds,
            accuracy: Math.round((qualityTotal / Math.max(1, qualityFrames)) * 100),
          };
          const completionStartedAt = performance.now();
          void (async () => {
            const recording = (await recorderRef.current?.stop()) ?? null;
            recorderRef.current = null;
            const remainingDelay = Math.max(
              0,
              520 - (performance.now() - completionStartedAt),
            );
            if (remainingDelay > 0) {
              await new Promise<void>((resolve) => {
                window.setTimeout(resolve, remainingDelay);
              });
            }
            if (!active) return;
            await completeSession(stats, recording);
          })();
        }
      }
    };

    worker.onmessage = (event: MessageEvent<PoseWorkerResponse>) => {
      if (!active) return;
      const message = event.data;
      switch (message.type) {
        case "LOAD_PROGRESS":
          setModelProgress(Math.round(message.progress * 100));
          break;
        case "READY":
          workerReady = true;
          setDelegate(message.delegate);
          setModelProgress(100);
          if (!cameraReady) setStatus("requesting-camera");
          maybeStart();
          break;
        case "RESULT":
          inFlight = false;
          handleResult(message);
          scheduleNext();
          break;
        case "ERROR":
          inFlight = false;
          resetSpeechPrompt();
          setStatus("error");
          setError(`姿态识别没有启动：${message.message}。请检查网络后重试。`);
          break;
      }
    };

    worker.onerror = (workerError) => {
      if (!active) return;
      console.error(workerError);
      resetSpeechPrompt();
      setStatus("error");
      setError("姿态识别模块加载失败。刷新页面或更换浏览器后再试一次。");
    };

    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
    const modelName =
      modelVariant === "Lite"
        ? "pose_landmarker_lite.task"
        : "pose_landmarker_full.task";
    const initMessage: PoseWorkerRequest = {
      type: "INIT",
      wasmRoot: new URL("wasm", baseUrl).href.replace(/\/$/, ""),
      modelUrl: new URL(`models/${modelName}`, baseUrl).href,
    };
    worker.postMessage(initMessage);

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("MEDIA_DEVICES_UNAVAILABLE");
      }
      setStatus("requesting-camera");
      const videoConstraints: MediaTrackConstraints = {
        facingMode: "user",
        width: { ideal: 720 },
        height: { ideal: 1_280 },
        frameRate: { ideal: 30, max: 30 },
      };
      const supportedConstraints = navigator.mediaDevices.getSupportedConstraints?.() as
        | (MediaTrackSupportedConstraints & { resizeMode?: boolean })
        | undefined;
      if (supportedConstraints?.resizeMode) {
        (
          videoConstraints as MediaTrackConstraints & {
            resizeMode: "none";
          }
        ).resizeMode = "none";
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });
      cameraStreams.add(stream);

      if (!active) {
        stopMediaStream(stream);
        return;
      }

      const [videoTrack] = stream.getVideoTracks();
      let hardwareZoomReady = videoTrack
        ? await applyWidestCameraView(videoTrack)
        : false;

      if (active && videoTrack && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const candidates: CameraCandidate[] = devices
            .filter((device) => device.kind === "videoinput")
            .map((device) => {
              const capableDevice = device as MediaDeviceInfo & {
                getCapabilities?: () => { facingMode?: string | readonly string[] };
              };
              let facingModes: readonly string[] | undefined;
              try {
                const facingMode = capableDevice.getCapabilities?.().facingMode;
                facingModes = Array.isArray(facingMode)
                  ? facingMode
                  : typeof facingMode === "string"
                    ? [facingMode]
                    : undefined;
              } catch {
                facingModes = undefined;
              }
              return {
                deviceId: device.deviceId,
                label: device.label,
                facingModes,
              };
            });
          const widerDeviceId = findWiderCameraDevice(
            candidates,
            videoTrack.getSettings().deviceId,
            "user",
          );

          if (
            active &&
            widerDeviceId &&
            (await applyCameraDevice(videoTrack, widerDeviceId))
          ) {
            if (!active) {
              stopMediaStream(stream);
              return;
            }
            hardwareZoomReady = await applyWidestCameraView(videoTrack);
          }
        } catch {
          // Device labels and source switching vary across mobile browsers.
          // Keep the already-working front camera when switching is unavailable.
        }
      }

      const video = videoRef.current;
      if (!active || !video) {
        stopMediaStream(stream);
        return;
      }
      video.srcObject = stream;
      await video.play();
      updateVisibleBounds();
      if (videoTrack) {
        videoTrackRef.current = videoTrack;
        let hardwareRange: CameraZoomRange | null = null;
        if (hardwareZoomReady && typeof videoTrack.getCapabilities === "function") {
          try {
            const zoomOutRange = getCameraZoomOutRange(
              videoTrack.getCapabilities(),
            );
            if (
              zoomOutRange &&
              (await applyCameraZoom(videoTrack, zoomOutRange.max))
            ) {
              hardwareRange = zoomOutRange;
            }
          } catch {
            hardwareRange = null;
          }
        }

        zoomRangeRef.current = hardwareRange;
        setCameraZoomRange(hardwareRange);
        setCameraZoomState(hardwareRange?.max ?? 1);
      }
      cameraReady = true;
      if (!workerReady) setStatus("loading-model");
      maybeStart();
    };

    void startCamera().catch((cameraError) => {
      if (!active) return;
      stopCamera();
      resetSpeechPrompt();
      console.error(cameraError);
      setStatus("error");
      setError(cameraErrorMessage(cameraError));
    });

    const timer = window.setInterval(() => {
      if (sessionStartedAt === 0 || pausedRef.current || finished) return;
      setElapsedSeconds(Math.floor((performance.now() - sessionStartedAt) / 1_000));
    }, 1_000);

    return () => {
      active = false;
      stopFrameRequest();
      window.clearInterval(timer);
      window.removeEventListener("resize", updateVisibleBounds);
      scheduleNextRef.current = () => undefined;
      resetSpeechPromptRef.current = () => undefined;
      resetSpeechPrompt();
      recorderRef.current?.discard();
      recorderRef.current = null;
      videoTrackRef.current = null;
      zoomRangeRef.current = null;
      zoomRequestRef.current += 1;
      stopCamera();
      clearPose(canvasRef.current);
      const closeMessage: PoseWorkerRequest = { type: "CLOSE" };
      worker.postMessage(closeMessage);
      worker.terminate();
    };
  }, [avatar, exercise.readyCue, exerciseId, modelVariant, retryToken, target]);

  const retry = useCallback(() => {
    resetSpeechPromptRef.current();
    setRetryToken((token) => token + 1);
  }, []);

  const togglePaused = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    resetSpeechPromptRef.current();
    if (next) {
      recorderRef.current?.pause();
    } else {
      recorderRef.current?.resume();
      scheduleNextRef.current();
    }
    setPaused(next);
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    resetSpeechPromptRef.current();
    setSoundEnabled(next);
  }, []);

  const setCameraZoom = useCallback((requestedZoom: number) => {
    const range = zoomRangeRef.current;
    const track = videoTrackRef.current;
    if (!range || !track || !Number.isFinite(requestedZoom)) return;

    const nextZoom = Math.min(range.max, Math.max(range.min, requestedZoom));
    setCameraZoomState(nextZoom);

    const requestId = ++zoomRequestRef.current;
    void applyCameraZoom(track, nextZoom).then((applied) => {
      if (
        requestId !== zoomRequestRef.current ||
        track !== videoTrackRef.current ||
        applied
      ) {
        return;
      }

      const actualZoom = (
        track.getSettings() as MediaTrackSettings & { zoom?: number }
      ).zoom;
      if (typeof actualZoom === "number") setCameraZoomState(actualZoom);
    });
  }, []);

  return {
    videoRef,
    canvasRef,
    status,
    modelProgress,
    modelVariant,
    delegate,
    count,
    phase,
    feedback,
    poseVisible,
    quality,
    elapsedSeconds,
    paused,
    soundEnabled,
    cameraZoom,
    cameraZoomRange,
    error,
    retry,
    togglePaused,
    toggleSound,
    setCameraZoom,
  };
}
