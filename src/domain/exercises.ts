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
    cameraHint: "手机放在身体侧前方，确保头到脚完整入镜",
    readyCue: "先站直，让我看清全身",
    defaultTarget: 12,
  },
  {
    id: "push-up",
    label: "俯卧撑",
    enLabel: "PUSH-UP",
    description: "追踪肩、肘、腕与身体直线，撑起后计为一次。",
    cameraHint: "手机横向放低，从身体侧面拍摄全身",
    readyCue: "侧身进入画面，撑起并保持身体一条直线",
    defaultTarget: 10,
  },
  {
    id: "jumping-jack",
    label: "开合跳",
    enLabel: "JUMPING JACK",
    description: "同时识别手臂上举和双脚开合，合拢后完成计数。",
    cameraHint: "手机正对身体，预留双臂和双腿张开的空间",
    readyCue: "面向镜头，双手放下并拢站好",
    defaultTarget: 20,
  },
  {
    id: "lunge",
    label: "弓步蹲",
    enLabel: "LUNGE",
    description: "检测前后腿弯曲和重心下降，回到站姿后计数。",
    cameraHint: "手机放在侧面，确保前后两只脚都在画面内",
    readyCue: "侧身站直，双脚完整进入画面",
    defaultTarget: 12,
  },
] as const satisfies readonly ExerciseDefinition[];

export function getExercise(id: ExerciseId): ExerciseDefinition {
  return EXERCISES.find((exercise) => exercise.id === id) ?? EXERCISES[0];
}
