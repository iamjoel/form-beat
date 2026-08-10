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
import { clearPose, drawPose, type RenderSize } from "../../lib/pose-renderer";
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
}

interface WorkoutPageInstance {
  data: WorkoutPageData;
  setData(data: Partial<WorkoutPageData>): void;
  cameraContext?: CameraContext;
  frameListener?: CameraFrameListener;
  visionSession?: VKSession;
  previewCanvasNode?: CanvasNodeResult["node"];
  previewCanvasContext?: CanvasRenderingContext2D;
  canvasNode?: CanvasNodeResult["node"];
  canvasContext?: CanvasRenderingContext2D;
  canvasPromise?: Promise<void>;
  displaySize?: RenderSize;
  sourceSize?: RenderSize;
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
  timedOutVideoPath?: string;
  finishing: boolean;
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
  stopRecording(): Promise<string | null>;
  finish(reachedTarget: boolean): Promise<void>;
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
  } satisfies WorkoutPageData,

  onLoad(this: WorkoutPageInstance, query: Record<string, string | undefined>) {
    const exerciseId = parseExercise(query.exercise);
    const exercise = getExercise(exerciseId);
    const requestedTarget = Number(query.target);
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
    this.finishing = false;
    this.lastFeedback = exercise.readyCue;
    this.lastQualityBucket = -1;
    this.setData({
      exerciseId,
      exerciseLabel: exercise.label,
      target,
      feedback: exercise.readyCue,
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
    this.stopTracking();
    if (this.recordingStarted && !this.finishing) {
      this.recordingStarted = false;
      this.cameraContext?.stopRecord({});
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

      this.cameraContext.startRecord({
        selfieMirror: true,
        timeout: 300,
        success: () => {
          this.recordingStarted = true;
        },
        fail: (error) => {
          console.warn("原始相机录像启动失败", error);
          this.setData({ recordingAvailable: false });
        },
        timeoutCallback: (result) => {
          this.recordingStarted = false;
          this.timedOutVideoPath = result.tempVideoPath;
          void this.finish(false);
        },
      });
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
        );
      } else {
        clearPose(this.canvasContext, display);
      }
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
    const elapsedLabel = formatElapsed(this.getActiveDuration());
    if (elapsedLabel !== this.data.elapsedLabel) this.setData({ elapsedLabel });
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

  stopRecording(this: WorkoutPageInstance): Promise<string | null> {
    if (this.timedOutVideoPath) return Promise.resolve(this.timedOutVideoPath);
    if (!this.cameraContext || !this.recordingStarted) return Promise.resolve(null);
    this.recordingStarted = false;
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
