import {
  EXERCISE_CATALOG,
  getExerciseCatalogEntry,
  getMuscleGroup,
  type CatalogExerciseId,
} from "../../shared/core/domain/exercise-catalog";
import {
  getExercise,
} from "../../shared/core/domain/exercises";
import type { HuskySpriteAssetId } from "../../shared/core/lib/exercise-demo";
import { getExerciseDemoProject } from "../../shared/core/lib/exercise-demo-project";
import { getMotionFrame } from "../../shared/core/lib/motion-project";
import {
  createHuskySpriteRenderer,
  drawExerciseDemo,
  type DemoCharacterRenderer,
  type DemoRenderSize,
  type DemoSpriteImage,
} from "../../lib/exercise-demo-renderer";

const PREFERENCES_KEY = "workout-detect:preferences:v1";
const DEMO_SPRITE_PATHS: Record<HuskySpriteAssetId, string> = {
  "husky-exercise-sprites-v2": "/assets/generated/husky-exercise-sprites-v2.png",
  "husky-exercise-sprites-v3": "/assets/generated/husky-exercise-sprites-v3.png",
};

type DemoLoadStatus = "loading" | "ready" | "error";

interface ActionDetailData {
  exerciseId: CatalogExerciseId;
  label: string;
  meta: string;
  canStartWorkout: boolean;
  summary: string;
  muscleGroups: { id: string; label: string }[];
  steps: { index: string; copy: string }[];
  cues: string[];
  demoStatus: DemoLoadStatus;
}

interface ActionDetailPageInstance {
  data: ActionDetailData;
  setData(data: Partial<ActionDetailData>, callback?: () => void): void;
  demoCanvasContext?: CanvasRenderingContext2D;
  demoCanvasSize?: DemoRenderSize;
  demoCharacterRenderer?: DemoCharacterRenderer;
  demoAnimationTimer?: ReturnType<typeof setInterval>;
  demoAnimationStartedAt?: number;
  demoReady?: boolean;
  demoLoadId?: number;
  startDemoAnimation(): void;
  stopDemoAnimation(): void;
}

function detailData(exerciseId: CatalogExerciseId): ActionDetailData {
  const entry = getExerciseCatalogEntry(exerciseId);
  return {
    exerciseId,
    label: entry.label,
    meta: `${entry.difficulty} · ${entry.equipment}`,
    canStartWorkout: entry.trainingExerciseId !== null,
    summary: entry.summary,
    muscleGroups: entry.muscleGroups.map((groupId) => ({
      id: groupId,
      label: getMuscleGroup(groupId).label,
    })),
    steps: entry.steps.map((copy, index) => ({
      index: String(index + 1).padStart(2, "0"),
      copy,
    })),
    cues: [...entry.cues],
    demoStatus: "loading",
  };
}

Page({
  data: detailData(EXERCISE_CATALOG[0].id),

  onLoad(this: ActionDetailPageInstance, query: Record<string, string | undefined>) {
    const exerciseId = EXERCISE_CATALOG.some((exercise) => exercise.id === query.id)
      ? query.id as CatalogExerciseId
      : EXERCISE_CATALOG[0].id;
    const data = detailData(exerciseId);
    wx.setNavigationBarTitle({ title: data.label });
    this.setData(data);
  },

  onReady(this: ActionDetailPageInstance) {
    this.demoReady = true;
    this.startDemoAnimation();
  },

  onShow(this: ActionDetailPageInstance) {
    if (this.demoReady) this.startDemoAnimation();
  },

  onHide(this: ActionDetailPageInstance) {
    this.stopDemoAnimation();
  },

  onUnload(this: ActionDetailPageInstance) {
    this.demoReady = false;
    this.stopDemoAnimation();
  },

  onResize(this: ActionDetailPageInstance) {
    this.stopDemoAnimation();
    setTimeout(() => this.startDemoAnimation(), 0);
  },

  startDemoAnimation(this: ActionDetailPageInstance) {
    this.stopDemoAnimation();
    const loadId = this.demoLoadId;
    this.setData({ demoStatus: "loading" });
    const query = wx.createSelectorQuery();
    query.select("#action-demo-canvas").fields({ node: true, size: true });
    query.exec((results) => {
      const result = results[0];
      if (!result?.node || !result.width || !result.height) {
        if (this.demoLoadId === loadId) this.setData({ demoStatus: "error" });
        return;
      }
      const pixelRatio = Math.min(2, wx.getSystemInfoSync().pixelRatio || 1);
      result.node.width = Math.round(result.width * pixelRatio);
      result.node.height = Math.round(result.height * pixelRatio);
      const context = result.node.getContext("2d");
      context.scale(pixelRatio, pixelRatio);
      this.demoCanvasContext = context;
      this.demoCanvasSize = { width: result.width, height: result.height };
      this.demoAnimationStartedAt = Date.now();
      const project = getExerciseDemoProject(this.data.exerciseId);

      const render = () => {
        if (
          this.demoLoadId !== loadId ||
          !this.demoCanvasContext ||
          !this.demoCanvasSize
        ) return;
        const elapsedMs = Date.now() - (this.demoAnimationStartedAt ?? Date.now());
        drawExerciseDemo(
          this.demoCanvasContext,
          project,
          getMotionFrame(project, elapsedMs),
          this.demoCanvasSize,
          this.demoCharacterRenderer ?? null,
        );
      };

      let started = false;
      const startRendering = () => {
        if (started || this.demoLoadId !== loadId) return;
        started = true;
        render();
        this.setData({ demoStatus: "ready" });
        this.demoAnimationTimer = setInterval(render, 33);
      };
      const assetId = project.character?.assetId === "husky-exercise-sprites-v3"
        ? "husky-exercise-sprites-v3"
        : "husky-exercise-sprites-v2";
      const sprite = result.node.createImage() as DemoSpriteImage;
      sprite.onload = () => {
        if (this.demoLoadId !== loadId) return;
        this.demoCharacterRenderer = createHuskySpriteRenderer({ [assetId]: sprite });
        startRendering();
      };
      sprite.onerror = () => {
        if (this.demoLoadId === loadId) this.setData({ demoStatus: "error" });
      };
      sprite.src = DEMO_SPRITE_PATHS[assetId];
    });
  },

  stopDemoAnimation(this: ActionDetailPageInstance) {
    this.demoLoadId = (this.demoLoadId ?? 0) + 1;
    if (this.demoAnimationTimer) clearInterval(this.demoAnimationTimer);
    this.demoAnimationTimer = undefined;
    this.demoCanvasContext = undefined;
    this.demoCanvasSize = undefined;
    this.demoCharacterRenderer = undefined;
  },

  goBack() {
    wx.navigateBack();
  },

  startWorkout(this: ActionDetailPageInstance) {
    const trainingExerciseId = getExerciseCatalogEntry(
      this.data.exerciseId,
    ).trainingExerciseId;
    if (!trainingExerciseId) return;
    const exercise = getExercise(trainingExerciseId);
    wx.setStorageSync(PREFERENCES_KEY, {
      exerciseId: exercise.id,
      target: exercise.defaultTarget,
    });
    wx.redirectTo({ url: "/pages/setup/index" });
  },
});
