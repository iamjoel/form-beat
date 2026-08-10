export type ExerciseId = "squat" | "push-up" | "jumping-jack" | "lunge";

export interface ExerciseDefinition {
  id: ExerciseId;
  label: string;
  enLabel: string;
  description: string;
  cameraHint: string;
  readyCue: string;
  defaultTarget: number;
}

export const EXERCISES = [
  {
    id: "squat",
    label: "深蹲",
    enLabel: "SQUAT",
    description: "识别髋、膝、踝角度，站直后完成一次完整下蹲。",
    cameraHint: "侧前方拍摄，肩、髋、膝和脚踝入镜",
    readyCue: "让肩、髋、膝和脚踝进入画面",
    defaultTarget: 12,
  },
  {
    id: "push-up",
    label: "俯卧撑",
    enLabel: "PUSH-UP",
    description: "追踪肩、肘、腕与身体直线，撑起后计为一次。",
    cameraHint: "侧面拍摄，肩、肘、手腕、髋和脚踝入镜",
    readyCue: "让肩、肘、手腕、髋和脚踝进入画面",
    defaultTarget: 10,
  },
  {
    id: "jumping-jack",
    label: "开合跳",
    enLabel: "JUMPING JACK",
    description: "同时识别手臂上举和双脚开合，合拢后完成计数。",
    cameraHint: "正面拍摄，双肩、手腕、髋和脚踝入镜",
    readyCue: "让双肩、手腕、髋和脚踝进入画面",
    defaultTarget: 20,
  },
  {
    id: "lunge",
    label: "弓步蹲",
    enLabel: "LUNGE",
    description: "检测前后腿弯曲和重心下降，回到站姿后计数。",
    cameraHint: "侧面拍摄，髋、双膝和双脚踝入镜",
    readyCue: "让髋、双膝和双脚踝进入画面",
    defaultTarget: 12,
  },
] as const satisfies readonly ExerciseDefinition[];

export function getExercise(id: ExerciseId): ExerciseDefinition {
  return EXERCISES.find((exercise) => exercise.id === id) ?? EXERCISES[0];
}
