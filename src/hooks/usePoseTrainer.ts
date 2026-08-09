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
import type { PosePoint } from "../lib/geometry";
import { playCompletionCue, playRepCue } from "../lib/audio";
import type {
  PoseDelegate,
  PoseWorkerRequest,
  PoseWorkerResponse,
} from "../lib/pose-worker-types";
import {
  createRepCounterState,
  updateRepCounter,
  type CounterPhase,
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
  error: string | null;
  retry: () => void;
  togglePaused: () => void;
  toggleSound: () => void;
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

function drawPose(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: readonly PosePoint[],
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
  const scheduleNextRef = useRef<() => void>(() => undefined);
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
  const [error, setError] = useState<string | null>(null);
  const completeSession = useEffectEvent(onComplete);

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
    let previousLandmarks: PosePoint[] | null = null;
    let previousWorldLandmarks: PosePoint[] | null = null;
    let qualityTotal = 0;
    let qualityFrames = 0;
    let lastFeedback = exercise.readyCue;
    let lastPoseVisible = false;
    let lastQualityBucket = 0;
    let lastPhase: CounterPhase = "seeking-start";
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

    const stopCamera = () => {
      const video = videoRef.current;
      const stream = video?.srcObject;
      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }
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

      if (landmarks.length) drawPose(canvas, video, landmarks, avatar);
      else clearPose(canvas);

      const update = updateRepCounter(exerciseId, counter.current, {
        landmarks,
        worldLandmarks,
        size: { width: video.videoWidth, height: video.videoHeight },
        timestamp: message.timestamp,
      });
      counter.current = update.state;
      qualityTotal += update.quality;
      qualityFrames += 1;

      const visible = landmarks.length > 0 && update.quality >= 0.5;
      setStablePoseVisible(visible);
      setStableFeedback(landmarks.length ? update.feedback : exercise.readyCue);
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
          setStatus("error");
          setError(`姿态识别没有启动：${message.message}。请检查网络后重试。`);
          break;
      }
    };

    worker.onerror = (workerError) => {
      if (!active) return;
      console.error(workerError);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 1_280 },
          frameRate: { ideal: 30, max: 30 },
        },
      });

      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      cameraReady = true;
      if (!workerReady) setStatus("loading-model");
      maybeStart();
    };

    void startCamera().catch((cameraError) => {
      if (!active) return;
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
      scheduleNextRef.current = () => undefined;
      recorderRef.current?.discard();
      recorderRef.current = null;
      stopCamera();
      clearPose(canvasRef.current);
      const closeMessage: PoseWorkerRequest = { type: "CLOSE" };
      worker.postMessage(closeMessage);
      worker.terminate();
    };
  }, [avatar, exercise.readyCue, exerciseId, modelVariant, retryToken, target]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  const togglePaused = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      pausedRef.current = next;
      if (next) {
        recorderRef.current?.pause();
      } else {
        recorderRef.current?.resume();
        scheduleNextRef.current();
      }
      return next;
    });
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current;
      soundEnabledRef.current = next;
      return next;
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
    error,
    retry,
    togglePaused,
    toggleSound,
  };
}
