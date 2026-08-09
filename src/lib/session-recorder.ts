export interface CompletedRecording {
  blob: Blob;
  mimeType: string;
}

export interface SessionRecorder {
  stop: () => Promise<CompletedRecording | null>;
  discard: () => void;
  pause: () => void;
  resume: () => void;
}

const MAX_RECORDING_LONG_EDGE = 1_280;
const MAX_RECORDING_SHORT_EDGE = 720;
const RECORDING_FRAME_RATE = 30;
const VIDEO_BITS_PER_SECOND = 3_500_000;
const MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp8",
  "video/webm;codecs=vp9",
  "video/webm",
] as const;

function supportedMimeTypes(): string[] {
  if (typeof MediaRecorder === "undefined") return [];
  return MIME_TYPES.filter((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function evenDimension(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * Records a mirrored composite of the camera and the latest pose overlay.
 * Returns null when the current browser cannot record a canvas stream.
 */
export function createSessionRecorder(
  video: HTMLVideoElement,
  overlay: HTMLCanvasElement,
  getPreviewZoom: () => number = () => 1,
): SessionRecorder | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function" ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    return null;
  }

  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const scale = Math.min(
    1,
    MAX_RECORDING_LONG_EDGE / Math.max(sourceWidth, sourceHeight),
    MAX_RECORDING_SHORT_EDGE / Math.min(sourceWidth, sourceHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = evenDimension(sourceWidth * scale);
  canvas.height = evenDimension(sourceHeight * scale);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;

  let stream: MediaStream;
  try {
    stream = canvas.captureStream(RECORDING_FRAME_RATE);
  } catch {
    return null;
  }

  let preferredMimeType: string | undefined;
  let mediaRecorder: MediaRecorder | null = null;
  for (const mimeType of [...supportedMimeTypes(), undefined]) {
    try {
      mediaRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      });
      preferredMimeType = mimeType;
      break;
    } catch {
      // Capability checks are hints; try the next codec and finally browser defaults.
    }
  }
  if (!mediaRecorder) {
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }

  const chunks: Blob[] = [];
  let active = true;
  let paused = false;
  let discarded = false;
  let failed = false;
  let frameRequest = 0;
  let usesVideoFrameCallback = false;
  let stopPromise: Promise<CompletedRecording | null> | null = null;
  let resolveStopped: (() => void) | null = null;
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });

  const drawFrame = () => {
    if (!active || paused || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    const currentWidth = video.videoWidth;
    const currentHeight = video.videoHeight;
    if (!currentWidth || !currentHeight) return;
    const previewZoom = Math.min(1, Math.max(0.1, getPreviewZoom()));
    const drawWidth = canvas.width * previewZoom;
    const drawHeight = canvas.height * previewZoom;
    const offsetX = (canvas.width - drawWidth) / 2;
    const offsetY = (canvas.height - drawHeight) / 2;

    context.fillStyle = "#0e0f0d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(
      video,
      offsetX,
      offsetY,
      drawWidth,
      drawHeight,
    );
    if (overlay.width > 0 && overlay.height > 0) {
      context.drawImage(
        overlay,
        offsetX,
        offsetY,
        drawWidth,
        drawHeight,
      );
    }
    context.restore();
  };

  const cancelFrame = () => {
    if (!frameRequest) return;
    if (usesVideoFrameCallback && "cancelVideoFrameCallback" in video) {
      video.cancelVideoFrameCallback(frameRequest);
    } else {
      cancelAnimationFrame(frameRequest);
    }
    frameRequest = 0;
  };

  const scheduleFrame = () => {
    if (!active) return;
    cancelFrame();
    if ("requestVideoFrameCallback" in video) {
      usesVideoFrameCallback = true;
      frameRequest = video.requestVideoFrameCallback(() => {
        frameRequest = 0;
        drawFrame();
        scheduleFrame();
      });
    } else {
      usesVideoFrameCallback = false;
      frameRequest = requestAnimationFrame(() => {
        frameRequest = 0;
        drawFrame();
        scheduleFrame();
      });
    }
  };

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (!discarded && event.data.size > 0) chunks.push(event.data);
  });
  mediaRecorder.addEventListener("error", () => {
    failed = true;
  });
  mediaRecorder.addEventListener(
    "stop",
    () => {
      active = false;
      cancelFrame();
      stream.getTracks().forEach((track) => track.stop());
      resolveStopped?.();
      resolveStopped = null;
    },
    { once: true },
  );

  drawFrame();
  scheduleFrame();
  try {
    mediaRecorder.start(1_000);
  } catch {
    active = false;
    cancelFrame();
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }

  const stop = (): Promise<CompletedRecording | null> => {
    if (stopPromise) return stopPromise;
    drawFrame();
    active = false;
    cancelFrame();

    if (mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.stop();
      } catch {
        failed = true;
        stream.getTracks().forEach((track) => track.stop());
        resolveStopped?.();
        resolveStopped = null;
      }
    } else {
      stream.getTracks().forEach((track) => track.stop());
      resolveStopped?.();
      resolveStopped = null;
    }

    stopPromise = stopped.then(() => {
      if (discarded || failed || chunks.length === 0) return null;

      let chunkMimeType = "";
      for (let index = chunks.length - 1; index >= 0; index -= 1) {
        if (chunks[index].type) {
          chunkMimeType = chunks[index].type;
          break;
        }
      }
      const mimeType =
        chunkMimeType ||
        mediaRecorder.mimeType ||
        preferredMimeType ||
        "application/octet-stream";
      const blob = new Blob(chunks, { type: mimeType });
      return blob.size > 0 ? { blob, mimeType } : null;
    });

    return stopPromise;
  };

  const discard = () => {
    if (discarded) return;
    discarded = true;
    chunks.length = 0;
    void stop();
  };

  const pause = () => {
    paused = true;
    if (mediaRecorder.state === "recording") mediaRecorder.pause();
  };

  const resume = () => {
    paused = false;
    if (mediaRecorder.state === "paused") mediaRecorder.resume();
  };

  return { stop, discard, pause, resume };
}
