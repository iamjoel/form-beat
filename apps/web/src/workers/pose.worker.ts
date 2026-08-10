/// <reference lib="webworker" />

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type {
  PoseDelegate,
  PoseWorkerRequest,
  PoseWorkerResponse,
} from "../lib/pose-worker-types";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
let landmarker: PoseLandmarker | null = null;
let processing = false;

function send(message: PoseWorkerResponse): void {
  workerScope.postMessage(message);
}

async function loadModel(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`模型加载失败（${response.status}）`);
  }

  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body?.getReader();
  if (!reader || total === 0) return response.arrayBuffer();

  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    send({ type: "LOAD_PROGRESS", progress: received / total });
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

async function createLandmarker(
  wasmRoot: string,
  modelBuffer: ArrayBuffer,
  delegate: PoseDelegate,
): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(wasmRoot, true);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetBuffer: new Uint8Array(modelBuffer),
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 1,
    outputSegmentationMasks: false,
    minPoseDetectionConfidence: 0.58,
    minPosePresenceConfidence: 0.58,
    minTrackingConfidence: 0.58,
  });
}

async function initialize(wasmRoot: string, modelUrl: string): Promise<void> {
  const modelBuffer = await loadModel(modelUrl);
  landmarker?.close();

  try {
    landmarker = await createLandmarker(wasmRoot, modelBuffer, "GPU");
    send({ type: "READY", delegate: "GPU" });
  } catch (gpuError) {
    console.warn("MediaPipe GPU 初始化失败，已切换到 CPU。", gpuError);
    landmarker?.close();
    landmarker = await createLandmarker(wasmRoot, modelBuffer, "CPU");
    send({ type: "READY", delegate: "CPU" });
  }
}

function serializeLandmarks(
  poses: readonly (readonly {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
  }[])[],
) {
  return poses.map((pose) =>
    pose.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility,
    })),
  );
}

workerScope.onmessage = async (event: MessageEvent<PoseWorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === "INIT") {
      await initialize(message.wasmRoot, message.modelUrl);
      return;
    }

    if (message.type === "CLOSE") {
      landmarker?.close();
      landmarker = null;
      workerScope.close();
      return;
    }

    if (message.type === "DETECT") {
      if (!landmarker || processing) {
        message.bitmap.close();
        return;
      }

      processing = true;
      const startedAt = performance.now();
      try {
        const result = landmarker.detectForVideo(message.bitmap, message.timestamp);
        send({
          type: "RESULT",
          landmarks: serializeLandmarks(result.landmarks),
          worldLandmarks: serializeLandmarks(result.worldLandmarks),
          inferenceMs: performance.now() - startedAt,
          timestamp: message.timestamp,
        });
      } finally {
        processing = false;
        message.bitmap.close();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send({ type: "ERROR", message });
  }
};

