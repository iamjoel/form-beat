import {
  EXERCISES,
  getExercise,
  type ExerciseId,
} from "../../shared/core/domain/exercises";
import { shouldSavePartialWorkout } from "../../shared/core/domain/session";
import {
  coverVisibleBounds,
  type PosePoint,
} from "../../shared/core/lib/geometry";
import {
  createRepCounterState,
  updateRepCounter,
  type RepCounterState,
} from "../../shared/core/lib/rep-counter";
import { CameraFrameRenderer } from "../../lib/camera-frame-renderer";
import { MaskedVideoRenderer } from "../../lib/masked-video-renderer";
import {
  clearPose,
  drawPose,
  getRecordingAvatarMask,
  type RecordingAvatarId,
  type RecordingAvatarMask,
  type RenderSize,
} from "../../lib/pose-renderer";
import { smoothPose, visionKitBodyToPose } from "../../lib/visionkit-adapter";
import { saveWorkoutRecord } from "../../lib/workout-records";

interface WorkoutPageData {
  exerciseId: ExerciseId;
  exerciseLabel: string;
  target: number;
  count: number;
  elapsedLabel: string;
  feedback: string;
  paused: boolean;
  poseVisible: boolean;
  status: "starting" | "tracking" | "error" | "finishing";
  error: string;
  recordingAvailable: boolean;
  recordingAvatar: RecordingAvatarId;
  recordingLabel: string;
}

interface WorkoutPageInstance {
  data: WorkoutPageData;
  setData(data: Partial<WorkoutPageData>): void;
  cameraContext?: CameraContext;
  maskedMediaRecorder?: MiniProgramMediaRecorder;
  maskedVideoRenderer?: MaskedVideoRenderer;
  maskedRecordingSize?: RenderSize;
  frameListener?: CameraFrameListener;
  visionSession?: VKSession;
  previewCanvasNode?: CanvasNodeResult["node"];
  previewCanvasContext?: CanvasRenderingContext2D;
  canvasNode?: CanvasNodeResult["node"];
  canvasContext?: CanvasRenderingContext2D;
  canvasPromise?: Promise<void>;
  displaySize?: RenderSize;
  sourceSize?: RenderSize;
  pendingDetectionFrame?: CameraFrame;
  cameraFrameRenderer: CameraFrameRenderer;
  previewRenderFailed: boolean;
  counterState: RepCounterState;
  previousLandmarks: PosePoint[] | null;
  processingFrame: boolean;
  processingWatchdog?: ReturnType<typeof setTimeout>;
  elapsedTimer?: ReturnType<typeof setInterval>;
  activeDurationMs: number;
  activeSegmentStartedAt: number;
  recordingStarted: boolean;
  recordingFramePending: boolean;
  recordingFrameFailed: boolean;
  maskedFramePromise?: Promise<void>;
  hasRecordedMaskedFrame: boolean;
  timedOutVideoPath?: string;
  finishing: boolean;
  pageUnloaded: boolean;
  lastFeedback: string;
  lastQualityBucket: number;
  initializeTracking(): Promise<void>;
  selectPoseCanvas(): Promise<void>;
  renderCameraFrame(frame: CameraFrame): boolean;
  handleCameraFrame(frame: CameraFrame): void;
  handleAnchors(anchors: VKBodyAnchor[]): void;
  updateElapsed(): void;
  getActiveDuration(now?: number): number;
  stopTracking(): void;
  startRawRecording(): void;
  startMaskedRecording(): Promise<void>;
  queueMaskedRecordingFrame(frame: CameraFrame, mask: RecordingAvatarMask): void;
  stopRecording(): Promise<string | null>;
  finish(reachedTarget: boolean): Promise<void>;
}

const PROFILE_STORAGE_KEY = "workout-detect:profile:v1";

function readRecordingAvatar(): RecordingAvatarId {
  const stored = wx.getStorageSync(PROFILE_STORAGE_KEY) as
    | { recordingAvatar?: unknown }
    | null;
  return stored?.recordingAvatar === "man" || stored?.recordingAvatar === "woman"
    ? stored.recordingAvatar
    : "none";
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "then" in value &&
      typeof (value as { then?: unknown }).then === "function",
  );
}

function withTimeout<T>(
  promise: PromiseLike<T>,
  milliseconds: number,
  code: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), milliseconds);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function destroyMediaRecorder(recorder: MiniProgramMediaRecorder | undefined): void {
  if (!recorder) return;
  try {
    const result = recorder.destroy();
    if (isPromiseLike<void>(result)) void result.then(undefined, () => undefined);
  } catch {
    // The runtime can already have reclaimed a stopped or failed recorder.
  }
}

async function startMediaRecorder(recorder: MiniProgramMediaRecorder): Promise<void> {
  let resolveStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const onStart = () => resolveStarted();
  recorder.on("start", onStart);
  try {
    const result = recorder.start();
    if (isPromiseLike<void>(result)) {
      await withTimeout(result, 5_000, "MASKED_VIDEO_START_TIMEOUT");
    } else {
      await withTimeout(started, 5_000, "MASKED_VIDEO_START_TIMEOUT");
    }
  } finally {
    recorder.off("start", onStart);
  }
}

async function stopMediaRecorder(
  recorder: MiniProgramMediaRecorder,
): Promise<MiniProgramMediaRecorderResult> {
  let resolveStopped: (result: MiniProgramMediaRecorderResult) => void = () => undefined;
  const stopped = new Promise<MiniProgramMediaRecorderResult>((resolve) => {
    resolveStopped = resolve;
  });
  const onStop = (result: MiniProgramMediaRecorderResult) => resolveStopped(result);
  recorder.on("stop", onStop);
  try {
    const result = recorder.stop();
    if (isPromiseLike<MiniProgramMediaRecorderResult>(result)) {
      return await withTimeout(result, 8_000, "MASKED_VIDEO_STOP_TIMEOUT");
    }
    return await withTimeout(stopped, 8_000, "MASKED_VIDEO_STOP_TIMEOUT");
  } finally {
    recorder.off("stop", onStop);
  }
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function parseExercise(value: string | undefined): ExerciseId {
  return EXERCISES.some((exercise) => exercise.id === value)
    ? (value as ExerciseId)
    : EXERCISES[0].id;
}

function configureCanvas(
  result: CanvasNodeResult,
  pixelRatio: number,
): CanvasRenderingContext2D {
  result.node.width = Math.round(result.width * pixelRatio);
  result.node.height = Math.round(result.height * pixelRatio);
  const context = result.node.getContext("2d");
  context.scale(pixelRatio, pixelRatio);
  return context;
}

Page({
  data: {
    exerciseId: EXERCISES[0].id,
    exerciseLabel: EXERCISES[0].label,
    target: EXERCISES[0].defaultTarget,
    count: 0,
    elapsedLabel: "00:00",
    feedback: EXERCISES[0].readyCue,
    paused: false,
    poseVisible: false,
    status: "starting",
    error: "",
    recordingAvailable: true,
    recordingAvatar: "none",
    recordingLabel: "原始画面录制中",
  } satisfies WorkoutPageData,

  onLoad(this: WorkoutPageInstance, query: Record<string, string | undefined>) {
    const exerciseId = parseExercise(query.exercise);
    const exercise = getExercise(exerciseId);
    const requestedTarget = Number(query.target);
    const recordingAvatar = readRecordingAvatar();
    const target = Number.isFinite(requestedTarget)
      ? Math.min(99, Math.max(1, Math.round(requestedTarget)))
      : exercise.defaultTarget;

    this.counterState = createRepCounterState();
    this.cameraFrameRenderer = new CameraFrameRenderer();
    this.previewRenderFailed = false;
    this.previousLandmarks = null;
    this.processingFrame = false;
    this.activeDurationMs = 0;
    this.activeSegmentStartedAt = 0;
    this.recordingStarted = false;
    this.recordingFramePending = false;
    this.recordingFrameFailed = false;
    this.hasRecordedMaskedFrame = false;
    this.finishing = false;
    this.pageUnloaded = false;
    this.lastFeedback = exercise.readyCue;
    this.lastQualityBucket = -1;
    this.setData({
      exerciseId,
      exerciseLabel: exercise.label,
      target,
      feedback: exercise.readyCue,
      recordingAvatar,
      recordingLabel:
        recordingAvatar === "none" ? "原始画面录制中" : "正在启动隐私录屏",
    });
  },

  onReady(this: WorkoutPageInstance) {
    void this.selectPoseCanvas();
  },

  onResize(this: WorkoutPageInstance) {
    this.canvasPromise = undefined;
    this.previewCanvasNode = undefined;
    this.previewCanvasContext = undefined;
    this.canvasNode = undefined;
    this.canvasContext = undefined;
    this.displaySize = undefined;
    void this.selectPoseCanvas();
  },

  onUnload(this: WorkoutPageInstance) {
    this.pageUnloaded = true;
    this.stopTracking();
    if (this.recordingStarted && !this.finishing) {
      void this.stopRecording();
    }
  },

  onCameraReady(this: WorkoutPageInstance) {
    void this.initializeTracking();
  },

  onCameraError(this: WorkoutPageInstance) {
    this.stopTracking();
    this.setData({
      status: "error",
      error: "无法使用相机。请在微信设置中允许相机权限后重试。",
    });
  },

  selectPoseCanvas(this: WorkoutPageInstance): Promise<void> {
    if (this.canvasPromise) return this.canvasPromise;
    this.canvasPromise = new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query.select("#camera-preview").fields({ node: true, size: true });
      query.select("#pose-overlay").fields({ node: true, size: true });
      query.exec((results) => {
        const previewResult = results[0];
        const poseResult = results[1];
        if (
          !previewResult?.node ||
          !previewResult.width ||
          !previewResult.height ||
          !poseResult?.node ||
          !poseResult.width ||
          !poseResult.height
        ) {
          reject(new Error("POSE_CANVAS_UNAVAILABLE"));
          return;
        }

        const pixelRatio = wx.getSystemInfoSync().pixelRatio || 1;
        this.previewCanvasNode = previewResult.node;
        this.previewCanvasContext = configureCanvas(previewResult, pixelRatio);
        this.canvasNode = poseResult.node;
        this.canvasContext = configureCanvas(poseResult, pixelRatio);
        this.displaySize = {
          width: previewResult.width,
          height: previewResult.height,
        };
        this.previewRenderFailed = false;
        resolve();
      });
    });
    return this.canvasPromise;
  },

  async initializeTracking(this: WorkoutPageInstance): Promise<void> {
    if (this.visionSession || this.finishing) return;

    try {
      await this.selectPoseCanvas();
      this.cameraContext = wx.createCameraContext();
      const session = wx.createVKSession({
        track: { body: { mode: 2 } },
        version: "v1",
      });
      this.visionSession = session;
      session.on("addAnchors", (anchors) => this.handleAnchors(anchors));
      session.on("updateAnchors", (anchors) => this.handleAnchors(anchors));
      session.on("removeAnchors", () => this.handleAnchors([]));

      await new Promise<void>((resolve, reject) => {
        session.start((error) => (error ? reject(error) : resolve()));
      });

      this.frameListener = this.cameraContext.onCameraFrame((frame) =>
        this.handleCameraFrame(frame),
      );
      this.frameListener.start({
        fail: (error) => {
          console.error("相机帧监听启动失败", error);
          this.setData({
            status: "error",
            error: "当前设备无法读取相机帧，请更新微信后重试。",
          });
        },
      });

      const now = Date.now();
      this.activeSegmentStartedAt = now;
      this.elapsedTimer = setInterval(() => this.updateElapsed(), 500);
      this.setData({ status: "tracking", error: "" });
      if (this.data.recordingAvatar === "none") {
        this.startRawRecording();
      } else {
        await this.startMaskedRecording();
      }
    } catch (error) {
      console.error("VisionKit 初始化失败", error);
      this.stopTracking();
      this.setData({
        status: "error",
        error: "人体识别没有启动。请确认微信版本支持 VisionKit 后重试。",
      });
    }
  },

  renderCameraFrame(this: WorkoutPageInstance, frame: CameraFrame): boolean {
    const context = this.previewCanvasContext;
    const display = this.displaySize;
    if (!context || !display || this.previewRenderFailed) return false;

    try {
      this.cameraFrameRenderer.draw(context, frame, display);
      return true;
    } catch (error) {
      this.previewRenderFailed = true;
      console.error("同步相机预览绘制失败", error);
      this.stopTracking();
      this.setData({
        status: "error",
        error: "当前设备无法同步相机画面，请更新微信后重试。",
      });
      return false;
    }
  },

  handleCameraFrame(this: WorkoutPageInstance, frame: CameraFrame) {
    if (this.finishing || !this.renderCameraFrame(frame)) return;
    if (this.processingFrame || this.data.paused || !this.visionSession) {
      return;
    }

    this.processingFrame = true;
    this.sourceSize = { width: frame.width, height: frame.height };
    this.pendingDetectionFrame =
      this.data.recordingAvatar === "none"
        ? frame
        : { ...frame, data: frame.data.slice(0) };
    if (this.processingWatchdog) clearTimeout(this.processingWatchdog);
    this.processingWatchdog = setTimeout(() => {
      this.processingFrame = false;
    }, 650);

    try {
      this.visionSession.detectBody({
        frameBuffer: frame.data,
        width: frame.width,
        height: frame.height,
        scoreThreshold: 0.5,
        sourceType: 0,
      });
    } catch (error) {
      console.warn("VisionKit 单帧识别失败", error);
      this.processingFrame = false;
    }
  },

  handleAnchors(this: WorkoutPageInstance, anchors: VKBodyAnchor[]) {
    if (this.processingWatchdog) clearTimeout(this.processingWatchdog);
    this.processingFrame = false;
    const detectedFrame = this.pendingDetectionFrame;
    this.pendingDetectionFrame = undefined;
    if (this.finishing || this.data.paused) return;

    const anchor = anchors.reduce<VKBodyAnchor | null>(
      (best, candidate) => (!best || candidate.score > best.score ? candidate : best),
      null,
    );
    const rawLandmarks = anchor ? visionKitBodyToPose(anchor) : [];
    const landmarks = rawLandmarks.length
      ? smoothPose(this.previousLandmarks, rawLandmarks)
      : [];
    this.previousLandmarks = landmarks.length ? landmarks : null;

    const source = this.sourceSize;
    const display = this.displaySize;
    if (!source || !display) return;
    const update = updateRepCounter(this.data.exerciseId, this.counterState, {
      landmarks,
      size: source,
      visibleBounds: coverVisibleBounds(source, display),
      timestamp: Date.now(),
    });
    this.counterState = update.state;

    if (this.canvasContext) {
      if (landmarks.length) {
        drawPose(
          this.canvasContext,
          source,
          display,
          landmarks,
          update.angleOverlays,
          this.data.recordingAvatar,
        );
      } else {
        clearPose(this.canvasContext, display);
      }
    }

    if (
      detectedFrame &&
      this.data.recordingAvatar !== "none" &&
      this.maskedRecordingSize
    ) {
      const mask = getRecordingAvatarMask(
        detectedFrame,
        this.maskedRecordingSize,
        landmarks,
        this.data.recordingAvatar,
      );
      if (mask) this.queueMaskedRecordingFrame(detectedFrame, mask);
    }

    const nextData: Partial<WorkoutPageData> = {};
    const feedback = landmarks.length
      ? update.feedback
      : getExercise(this.data.exerciseId).readyCue;
    if (feedback !== this.lastFeedback) {
      this.lastFeedback = feedback;
      nextData.feedback = feedback;
    }
    const poseVisible = Boolean(landmarks.length && update.requirementsMet);
    if (poseVisible !== this.data.poseVisible) nextData.poseVisible = poseVisible;

    const qualityBucket = Math.round(update.quality * 10);
    if (qualityBucket !== this.lastQualityBucket) {
      this.lastQualityBucket = qualityBucket;
    }

    if (update.didCount) {
      nextData.count = update.state.count;
      wx.vibrateShort({ type: update.state.count % 5 === 0 ? "medium" : "light" });
    }
    if (Object.keys(nextData).length > 0) this.setData(nextData);

    if (update.didCount && update.state.count >= this.data.target) {
      void this.finish(true);
    }
  },

  updateElapsed(this: WorkoutPageInstance) {
    const elapsed = this.getActiveDuration();
    const elapsedLabel = formatElapsed(elapsed);
    if (elapsedLabel !== this.data.elapsedLabel) this.setData({ elapsedLabel });
    if (elapsed >= 300_000 && !this.finishing) void this.finish(false);
  },

  getActiveDuration(this: WorkoutPageInstance, now = Date.now()): number {
    return (
      this.activeDurationMs +
      (!this.data.paused && this.activeSegmentStartedAt > 0
        ? now - this.activeSegmentStartedAt
        : 0)
    );
  },

  togglePaused(this: WorkoutPageInstance) {
    if (this.data.status !== "tracking" || this.finishing) return;
    const now = Date.now();
    if (this.data.paused) {
      this.activeSegmentStartedAt = now;
      this.setData({ paused: false, feedback: this.lastFeedback });
    } else {
      this.activeDurationMs += Math.max(0, now - this.activeSegmentStartedAt);
      this.activeSegmentStartedAt = 0;
      this.setData({ paused: true, poseVisible: false, feedback: "已暂停，不会计数" });
      if (this.canvasContext && this.displaySize) {
        clearPose(this.canvasContext, this.displaySize);
      }
    }
    this.updateElapsed();
  },

  stopWorkout(this: WorkoutPageInstance) {
    void this.finish(false);
  },

  retry(this: WorkoutPageInstance) {
    wx.redirectTo({
      url: `/pages/workout/index?exercise=${this.data.exerciseId}&target=${this.data.target}`,
    });
  },

  startRawRecording(this: WorkoutPageInstance) {
    this.cameraContext?.startRecord({
      selfieMirror: true,
      timeout: 300,
      success: () => {
        if (this.finishing || this.pageUnloaded) {
          this.cameraContext?.stopRecord({});
          return;
        }
        this.recordingStarted = true;
        this.setData({ recordingLabel: "原始画面录制中" });
      },
      fail: (error) => {
        console.warn("原始相机录像启动失败", error);
        this.setData({ recordingAvailable: false, recordingLabel: "本次不录屏" });
      },
      timeoutCallback: (result) => {
        this.recordingStarted = false;
        this.timedOutVideoPath = result.tempVideoPath;
        void this.finish(false);
      },
    });
  },

  async startMaskedRecording(this: WorkoutPageInstance): Promise<void> {
    const display = this.displaySize;
    if (!display || typeof wx.createMediaRecorder !== "function") {
      this.setData({
        recordingAvailable: false,
        recordingLabel: "隐私保护中 · 本次不录屏",
      });
      return;
    }

    try {
      const aspectRatio = display.height / Math.max(1, display.width);
      const width = Math.max(360, Math.min(720, Math.round(1280 / aspectRatio)));
      const height = Math.round(width * aspectRatio);
      const canvas = wx.createOffscreenCanvas({ type: "webgl", width, height });
      const gl = canvas.getContext("webgl", {
        alpha: false,
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | null;
      if (!gl) throw new Error("MASKED_VIDEO_WEBGL_UNAVAILABLE");

      const recordingSize = { width, height };
      const renderer = new MaskedVideoRenderer(gl, recordingSize);
      const recorder = wx.createMediaRecorder(canvas, {
        duration: 310,
        fps: 15,
        gop: 15,
        videoBitsPerSecond: 1800,
        width,
        height,
      });
      this.maskedMediaRecorder = recorder;
      this.maskedVideoRenderer = renderer;
      this.maskedRecordingSize = recordingSize;
      await startMediaRecorder(recorder);
      this.recordingStarted = true;
      if (this.finishing || this.pageUnloaded) {
        await this.stopRecording();
        return;
      }
      this.setData({ recordingLabel: "识别到面部后开始遮挡录屏" });
    } catch (error) {
      console.warn("隐私遮挡录像启动失败", error);
      destroyMediaRecorder(this.maskedMediaRecorder);
      this.maskedMediaRecorder = undefined;
      this.maskedVideoRenderer = undefined;
      this.maskedRecordingSize = undefined;
      this.recordingStarted = false;
      this.setData({
        recordingAvailable: false,
        recordingLabel: "隐私保护中 · 本次不录屏",
      });
    }
  },

  queueMaskedRecordingFrame(
    this: WorkoutPageInstance,
    frame: CameraFrame,
    mask: RecordingAvatarMask,
  ) {
    const recorder = this.maskedMediaRecorder;
    const renderer = this.maskedVideoRenderer;
    if (
      !recorder ||
      !renderer ||
      !this.recordingStarted ||
      this.recordingFramePending ||
      this.recordingFrameFailed ||
      this.data.paused ||
      this.finishing
    ) {
      return;
    }

    this.recordingFramePending = true;
    const requestedFrame = new Promise<void>((resolve, reject) => {
      const render = () => {
        try {
          renderer.draw(frame, mask);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      try {
        const result = recorder.requestFrame(render);
        if (isPromiseLike<void>(result)) {
          void result.then(undefined, reject);
        }
      } catch (error) {
        reject(error);
      }
    });
    const guardedFrame = withTimeout(
      requestedFrame,
      2_500,
      "MASKED_VIDEO_REQUEST_FRAME_TIMEOUT",
    );
    this.maskedFramePromise = guardedFrame;
    void guardedFrame.then(
      () => {
        this.recordingFramePending = false;
        if (!this.hasRecordedMaskedFrame) {
          this.hasRecordedMaskedFrame = true;
          this.setData({ recordingLabel: "遮挡画面录制中" });
        }
      },
      (error) => {
        console.warn("隐私遮挡录像帧写入失败", error);
        this.recordingFramePending = false;
        this.recordingFrameFailed = true;
        this.setData({
          recordingAvailable: false,
          recordingLabel: "录屏已停止 · 隐私仍受保护",
        });
      },
    );
  },

  stopTracking(this: WorkoutPageInstance) {
    this.frameListener?.stop();
    this.frameListener = undefined;
    if (this.processingWatchdog) clearTimeout(this.processingWatchdog);
    if (this.elapsedTimer) clearInterval(this.elapsedTimer);
    this.processingWatchdog = undefined;
    this.elapsedTimer = undefined;
    try {
      this.visionSession?.stop();
      this.visionSession?.destroy();
    } catch {
      // The host can already have reclaimed VisionKit during page teardown.
    }
    this.visionSession = undefined;
  },

  async stopRecording(this: WorkoutPageInstance): Promise<string | null> {
    if (this.timedOutVideoPath) return this.timedOutVideoPath;
    if (!this.recordingStarted) return null;
    this.recordingStarted = false;

    if (this.maskedMediaRecorder) {
      const recorder = this.maskedMediaRecorder;
      try {
        await this.maskedFramePromise;
        if (!this.hasRecordedMaskedFrame) return null;
        const result = await stopMediaRecorder(recorder);
        return result.tempFilePath || null;
      } catch (error) {
        console.warn("停止隐私遮挡录像失败", error);
        return null;
      } finally {
        destroyMediaRecorder(recorder);
        this.maskedMediaRecorder = undefined;
        this.maskedVideoRenderer = undefined;
      }
    }

    if (!this.cameraContext) return null;
    return new Promise((resolve) => {
      this.cameraContext?.stopRecord({
        compressed: false,
        success: (result) => resolve(result.tempVideoPath),
        fail: (error) => {
          console.warn("停止录像失败", error);
          resolve(null);
        },
      });
    });
  },

  async finish(this: WorkoutPageInstance, reachedTarget: boolean): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    const now = Date.now();
    const durationMilliseconds = this.getActiveDuration(now);
    if (!this.data.paused && this.activeSegmentStartedAt > 0) {
      this.activeDurationMs = durationMilliseconds;
      this.activeSegmentStartedAt = 0;
    }
    this.setData({ status: "finishing", poseVisible: false });
    this.stopTracking();

    const tempVideoPath = await this.stopRecording();
    const durationSeconds = Math.max(1, Math.round(durationMilliseconds / 1_000));
    const keepWorkout =
      reachedTarget || shouldSavePartialWorkout(durationMilliseconds);

    if (keepWorkout && tempVideoPath) {
      try {
        await saveWorkoutRecord({
          exerciseId: this.data.exerciseId,
          completedReps: this.counterState.count,
          targetReps: this.data.target,
          durationSeconds,
          tempVideoPath,
        });
      } catch (error) {
        console.error("小程序训练录像保存失败", error);
        wx.showToast({ title: "录像保存失败", icon: "none" });
      }
    }

    if (reachedTarget) {
      wx.redirectTo({
        url:
          `/pages/completion/index?exercise=${this.data.exerciseId}` +
          `&count=${this.counterState.count}&target=${this.data.target}` +
          `&duration=${durationSeconds}`,
      });
    } else {
      wx.navigateBack();
    }
  },
});
