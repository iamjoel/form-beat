import type { ExerciseId } from "./exercises";

export type MuscleGroupId =
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "core"
  | "glutes"
  | "legs";

export type CatalogExerciseId =
  | ExerciseId
  | "superman"
  | "close-grip-push-up"
  | "mountain-climber";

export interface MuscleGroupDefinition {
  id: MuscleGroupId;
  label: string;
  focus: string;
}

export interface ExerciseCatalogEntry {
  id: CatalogExerciseId;
  label: string;
  enLabel: string;
  trainingExerciseId: ExerciseId | null;
  primaryMuscleGroup: MuscleGroupId;
  muscleGroups: readonly MuscleGroupId[];
  difficulty: "入门" | "进阶";
  equipment: "徒手";
  summary: string;
  steps: readonly string[];
  cues: readonly string[];
}

export const MUSCLE_GROUPS = [
  { id: "chest", label: "胸部", focus: "推力与上身稳定" },
  { id: "back", label: "背部", focus: "背伸与肩胛控制" },
  { id: "shoulders", label: "肩部", focus: "上举与肩关节稳定" },
  { id: "arms", label: "手臂", focus: "肘部伸屈与支撑" },
  { id: "core", label: "核心", focus: "躯干稳定与力量传递" },
  { id: "glutes", label: "臀部", focus: "髋伸展与下肢驱动" },
  { id: "legs", label: "腿部", focus: "蹲起、跨步与落地稳定" },
] as const satisfies readonly MuscleGroupDefinition[];

export const EXERCISE_CATALOG = [
  {
    id: "push-up",
    label: "俯卧撑",
    enLabel: "PUSH-UP",
    trainingExerciseId: "push-up",
    primaryMuscleGroup: "chest",
    muscleGroups: ["chest", "shoulders", "arms", "core"],
    difficulty: "进阶",
    equipment: "徒手",
    summary: "保持身体连成一线，通过肘部伸屈训练胸部、肩部和手臂推力。",
    steps: [
      "双手略宽于肩，手腕位于肩部下方，脚尖支撑地面。",
      "收紧腹部和臀部，让肩、髋、踝保持一条直线。",
      "屈肘下降至接近直角，再推地回到手臂伸直。",
    ],
    cues: ["不要塌腰或抬髋", "肘部斜向后打开", "胸口主动靠近地面"],
  },
  {
    id: "superman",
    label: "超人式",
    enLabel: "SUPERMAN",
    trainingExerciseId: null,
    primaryMuscleGroup: "back",
    muscleGroups: ["back", "glutes", "core"],
    difficulty: "入门",
    equipment: "徒手",
    summary: "俯卧抬起胸口和四肢，训练背部伸展力量以及臀部、核心的协同稳定。",
    steps: [
      "俯卧在地面，双腿伸直，双臂向前伸展。",
      "收紧腹部和臀部，同时轻抬胸口、双臂和双腿。",
      "停顿一拍后缓慢回落，保持动作连续而受控。",
    ],
    cues: ["视线朝向地面", "不要猛抬头或过度反弓", "抬起与回落保持同样速度"],
  },
  {
    id: "jumping-jack",
    label: "开合跳",
    enLabel: "JUMPING JACK",
    trainingExerciseId: "jumping-jack",
    primaryMuscleGroup: "shoulders",
    muscleGroups: ["shoulders", "core", "legs"],
    difficulty: "入门",
    equipment: "徒手",
    summary: "手脚同步开合，提高肩部活动度、腿部弹性和全身协调。",
    steps: [
      "双脚并拢站立，双臂自然放在身体两侧。",
      "轻跳分开双脚，同时双臂从两侧举过头顶。",
      "再次轻跳，手脚同步回到起始位置并稳定落地。",
    ],
    cues: ["前脚掌轻柔落地", "手脚保持同一节奏", "膝盖不要向内扣"],
  },
  {
    id: "close-grip-push-up",
    label: "窄距俯卧撑",
    enLabel: "CLOSE-GRIP PUSH-UP",
    trainingExerciseId: null,
    primaryMuscleGroup: "arms",
    muscleGroups: ["arms", "chest", "shoulders", "core"],
    difficulty: "进阶",
    equipment: "徒手",
    summary: "把双手收窄并让手肘贴近身体，用自身体重强化肱三头肌和上肢支撑。",
    steps: [
      "从高位平板开始，双手放在胸口下方并略窄于肩。",
      "身体保持一条直线，屈肘时让手肘贴近肋骨。",
      "下降至胸口接近双手，再推地回到手臂伸直。",
    ],
    cues: ["手腕保持在肩部下方", "手肘不要向两侧张开", "全程收紧腹部和臀部"],
  },
  {
    id: "mountain-climber",
    label: "登山跑",
    enLabel: "MOUNTAIN CLIMBER",
    trainingExerciseId: null,
    primaryMuscleGroup: "core",
    muscleGroups: ["core", "shoulders", "arms", "legs"],
    difficulty: "进阶",
    equipment: "徒手",
    summary: "在高位平板中交替提膝，训练核心抗伸展能力和全身协调节奏。",
    steps: [
      "双手撑地进入高位平板，肩部位于手腕正上方。",
      "收紧躯干，将一侧膝盖向胸口方向提起。",
      "脚尖轻触回位后快速换腿，保持髋部高度稳定。",
    ],
    cues: ["肩膀不要退到手腕后方", "避免髋部上下弹跳", "先稳定再逐渐加快节奏"],
  },
  {
    id: "lunge",
    label: "弓步蹲",
    enLabel: "LUNGE",
    trainingExerciseId: "lunge",
    primaryMuscleGroup: "glutes",
    muscleGroups: ["glutes", "legs", "core"],
    difficulty: "入门",
    equipment: "徒手",
    summary: "以前后分腿姿势垂直下沉，强化单侧臀腿力量和平衡控制。",
    steps: [
      "从站姿向前迈出一步，前后脚保持髋宽而不是一条直线。",
      "身体垂直下沉，让前后膝同时弯曲并保持躯干直立。",
      "前脚掌发力推回站姿，再以同样方式完成另一侧。",
    ],
    cues: ["前膝沿脚尖方向移动", "后膝垂直靠近地面", "重心保持在两脚之间"],
  },
  {
    id: "squat",
    label: "深蹲",
    enLabel: "SQUAT",
    trainingExerciseId: "squat",
    primaryMuscleGroup: "legs",
    muscleGroups: ["legs", "glutes", "core"],
    difficulty: "入门",
    equipment: "徒手",
    summary: "用髋、膝、踝协同完成下蹲和站起，建立最基础的下肢力量。",
    steps: [
      "双脚略宽于髋，脚尖自然向外，先收紧躯干。",
      "髋部向后下方移动，膝盖沿脚尖方向弯曲。",
      "大腿接近平行地面后，脚掌均匀发力站回起始姿势。",
    ],
    cues: ["脚跟不要抬起", "膝盖与脚尖同向", "站起时完全伸髋"],
  },
] as const satisfies readonly ExerciseCatalogEntry[];

export function getMuscleGroup(id: MuscleGroupId): MuscleGroupDefinition {
  return MUSCLE_GROUPS.find((group) => group.id === id) ?? MUSCLE_GROUPS[0];
}

export function getExerciseCatalogEntry(
  exerciseId: CatalogExerciseId,
): ExerciseCatalogEntry {
  return EXERCISE_CATALOG.find((entry) => entry.id === exerciseId)
    ?? EXERCISE_CATALOG[0];
}

export function getCatalogExerciseLabel(exerciseId: CatalogExerciseId): string {
  return getExerciseCatalogEntry(exerciseId).label;
}
