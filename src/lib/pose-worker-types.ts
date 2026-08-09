import type { PosePoint } from "./geometry";

export type PoseDelegate = "GPU" | "CPU";

export type PoseWorkerRequest =
  | {
      type: "INIT";
      wasmRoot: string;
      modelUrl: string;
    }
  | {
      type: "DETECT";
      bitmap: ImageBitmap;
      timestamp: number;
    }
  | { type: "CLOSE" };

export type PoseWorkerResponse =
  | { type: "LOAD_PROGRESS"; progress: number }
  | { type: "READY"; delegate: PoseDelegate }
  | {
      type: "RESULT";
      landmarks: PosePoint[][];
      worldLandmarks: PosePoint[][];
      inferenceMs: number;
      timestamp: number;
    }
  | { type: "ERROR"; message: string };

