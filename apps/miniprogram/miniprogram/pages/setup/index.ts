import {
  EXERCISES,
  type ExerciseId,
} from "../../shared/core/domain/exercises";
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
const DEMO_DISMISSED_STORAGE_KEY = "workout-detect:exercise-demo-dismissed:v1";
const DEMO_SPRITE_PATH = "/assets/generated/husky-exercise-sprites-v2.png";
const MIN_TARGET = 1;
const MAX_TARGET = 99;

interface Preferences {
  exerciseId: ExerciseId;
  target: number;
}

interface SetupPageInstance {
  data: Preferences & {
    exercises: typeof EXERCISES;
    exerciseLabel: string;
    showDemo: boolean;
    skipDemo: boolean;
  };
  setData(
    data: Partial<SetupPageInstance["data"]>,
    callback?: () => void,
  ): void;
  demoCanvasNode?: CanvasNodeResult["node"];
  demoCanvasContext?: CanvasRenderingContext2D;
  demoCanvasSize?: DemoRenderSize;
  demoCharacterRenderer?: DemoCharacterRenderer;
  demoAnimationTimer?: ReturnType<typeof setInterval>;
  demoAnimationStartedAt?: number;
  startDemoAnimation(): void;
  stopDemoAnimation(): void;
  navigateToWorkout(): void;
}

function readPreferences(): Preferences {
  const stored = wx.getStorageSync(PREFERENCES_KEY) as Partial<Preferences> | null;
  const exercise = EXERCISES.find((item) => item.id === stored?.exerciseId);
  const target = Number(stored?.target);
  return {
    exerciseId: exercise?.id ?? EXERCISES[0].id,
    target:
      Number.isFinite(target) && target >= MIN_TARGET && target <= MAX_TARGET
        ? Math.round(target)
        : exercise?.defaultTarget ?? EXERCISES[0].defaultTarget,
  };
}

function savePreferences(preferences: Preferences): void {
  wx.setStorageSync(PREFERENCES_KEY, preferences);
}

function getExerciseCopy(exerciseId: ExerciseId) {
  const exercise =
    EXERCISES.find((item) => item.id === exerciseId) ?? EXERCISES[0];
  return {
    exerciseLabel: exercise.label,
  };
}

const initialPreferences = readPreferences();

Page({
  data: {
    exercises: EXERCISES,
    ...initialPreferences,
    ...getExerciseCopy(initialPreferences.exerciseId),
    showDemo: false,
    skipDemo: false,
  },

  onShow(this: SetupPageInstance) {
    const preferences = readPreferences();
    this.stopDemoAnimation();
    this.setData({
      ...preferences,
      ...getExerciseCopy(preferences.exerciseId),
      showDemo: false,
      skipDemo: false,
    });
  },

  onHide(this: SetupPageInstance) {
    this.stopDemoAnimation();
  },

  onUnload(this: SetupPageInstance) {
    this.stopDemoAnimation();
  },

  onResize(this: SetupPageInstance) {
    if (!this.data.showDemo) return;
    this.stopDemoAnimation();
    setTimeout(() => this.startDemoAnimation(), 0);
  },

  selectExercise(this: SetupPageInstance, event: MiniProgramEvent) {
    const exerciseId = event.currentTarget.dataset.id as ExerciseId;
    const exercise = EXERCISES.find((item) => item.id === exerciseId);
    if (!exercise) return;
    const next = {
      exerciseId,
      target: exercise.defaultTarget,
      ...getExerciseCopy(exerciseId),
    };
    this.setData(next);
    savePreferences({ exerciseId, target: exercise.defaultTarget });
  },

  changeTarget(this: SetupPageInstance, event: MiniProgramEvent) {
    const delta = Number(event.currentTarget.dataset.delta);
    if (!Number.isFinite(delta)) return;
    const target = Math.min(
      MAX_TARGET,
      Math.max(MIN_TARGET, this.data.target + delta),
    );
    this.setData({ target });
    savePreferences({ exerciseId: this.data.exerciseId, target });
  },

  startWorkout(this: SetupPageInstance) {
    savePreferences({
      exerciseId: this.data.exerciseId,
      target: this.data.target,
    });
    if (wx.getStorageSync(DEMO_DISMISSED_STORAGE_KEY) === true) {
      this.navigateToWorkout();
      return;
    }
    this.setData({ showDemo: true, skipDemo: false }, () => {
      this.startDemoAnimation();
    });
  },

  startDemoAnimation(this: SetupPageInstance) {
    this.stopDemoAnimation();
    const query = wx.createSelectorQuery();
    query.select("#exercise-demo-canvas").fields({ node: true, size: true });
    query.exec((results) => {
      const result = results[0];
      if (!this.data.showDemo || !result?.node || !result.width || !result.height) {
        return;
      }
      const pixelRatio = Math.min(2, wx.getSystemInfoSync().pixelRatio || 1);
      result.node.width = Math.round(result.width * pixelRatio);
      result.node.height = Math.round(result.height * pixelRatio);
      const context = result.node.getContext("2d");
      context.scale(pixelRatio, pixelRatio);
      this.demoCanvasNode = result.node;
      this.demoCanvasContext = context;
      this.demoCanvasSize = { width: result.width, height: result.height };
      this.demoAnimationStartedAt = Date.now();
      const project = getExerciseDemoProject(this.data.exerciseId);

      const render = () => {
        if (!this.data.showDemo || !this.demoCanvasContext || !this.demoCanvasSize) {
          return;
        }
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
        if (started || !this.data.showDemo) return;
        started = true;
        render();
        this.demoAnimationTimer = setInterval(render, 33);
      };
      const sprite = result.node.createImage() as DemoSpriteImage;
      sprite.onload = () => {
        this.demoCharacterRenderer = createHuskySpriteRenderer({
          "husky-exercise-sprites-v2": sprite,
        });
        startRendering();
      };
      sprite.onerror = startRendering;
      sprite.src = DEMO_SPRITE_PATH;
    });
  },

  stopDemoAnimation(this: SetupPageInstance) {
    if (this.demoAnimationTimer) clearInterval(this.demoAnimationTimer);
    this.demoAnimationTimer = undefined;
    this.demoCanvasNode = undefined;
    this.demoCanvasContext = undefined;
    this.demoCanvasSize = undefined;
    this.demoCharacterRenderer = undefined;
  },

  changeDemoPreference(
    this: SetupPageInstance,
    event: MiniProgramEvent<{ value: string[] }>,
  ) {
    this.setData({ skipDemo: event.detail.value.includes("skip") });
  },

  closeDemo(this: SetupPageInstance) {
    this.stopDemoAnimation();
    this.setData({ showDemo: false, skipDemo: false });
  },

  continueWorkout(this: SetupPageInstance) {
    if (this.data.skipDemo) {
      wx.setStorageSync(DEMO_DISMISSED_STORAGE_KEY, true);
    }
    this.stopDemoAnimation();
    this.navigateToWorkout();
  },

  navigateToWorkout(this: SetupPageInstance) {
    wx.navigateTo({
      url: `/pages/workout/index?exercise=${this.data.exerciseId}&target=${this.data.target}`,
    });
  },

  openFitness() {
    wx.navigateTo({ url: "/pages/records/index" });
  },

  openActions() {
    wx.redirectTo({ url: "/pages/actions/index" });
  },

  openProfile() {
    wx.navigateTo({ url: "/pages/profile/index" });
  },
});
