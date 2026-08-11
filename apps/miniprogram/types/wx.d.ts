interface MiniProgramEvent<TDetail = Record<string, unknown>> {
  currentTarget: {
    dataset: Record<string, string | number | undefined>;
  };
  detail: TDetail;
}

interface CameraFrame {
  data: ArrayBuffer;
  width: number;
  height: number;
}

interface CameraFrameListener {
  start(options?: {
    success?: () => void;
    fail?: (error: unknown) => void;
  }): void;
  stop(): void;
}

interface CameraRecordResult {
  tempThumbPath: string;
  tempVideoPath: string;
}

interface CameraContext {
  onCameraFrame(callback: (frame: CameraFrame) => void): CameraFrameListener;
  startRecord(options: {
    selfieMirror?: boolean;
    timeout?: number;
    success?: () => void;
    fail?: (error: unknown) => void;
    timeoutCallback?: (result: CameraRecordResult) => void;
  }): void;
  stopRecord(options: {
    compressed?: boolean;
    success?: (result: CameraRecordResult) => void;
    fail?: (error: unknown) => void;
  }): void;
}

interface VKPoint {
  x: number;
  y: number;
}

interface VKBodyAnchor {
  confidence: number[];
  points: VKPoint[];
  score: number;
}

interface VKSession {
  start(callback: (error?: unknown) => void): void;
  stop(): void;
  destroy(): void;
  on(
    event: "addAnchors" | "updateAnchors" | "removeAnchors",
    callback: (anchors: VKBodyAnchor[]) => void,
  ): void;
  detectBody(options: {
    frameBuffer: ArrayBuffer;
    width: number;
    height: number;
    scoreThreshold?: number;
    sourceType?: 0 | 1;
  }): void;
}

interface CanvasNodeResult {
  node: {
    width: number;
    height: number;
    createImage(): HTMLImageElement;
    getContext(type: "2d"): CanvasRenderingContext2D;
  };
  width: number;
  height: number;
}

interface FileSystemManager {
  saveFile(options: {
    tempFilePath: string;
    success: (result: { savedFilePath: string }) => void;
    fail: (error: unknown) => void;
  }): void;
  unlink(options: {
    filePath: string;
    success: () => void;
    fail: (error: unknown) => void;
  }): void;
}

interface SelectorQuery {
  select(selector: string): SelectorQuery;
  fields(options: { node: boolean; size: boolean }): SelectorQuery;
  exec(callback: (results: CanvasNodeResult[]) => void): void;
}

interface WxApi {
  createCameraContext(): CameraContext;
  createOffscreenCanvas(options: {
    type: "2d";
    width: number;
    height: number;
  }): OffscreenCanvas;
  createVKSession(options: {
    track: { body: { mode: 1 | 2 } };
    version?: "v1" | "v2";
  }): VKSession;
  createSelectorQuery(): SelectorQuery;
  getFileSystemManager(): FileSystemManager;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  getSystemInfoSync(): { pixelRatio: number };
  navigateTo(options: { url: string }): void;
  redirectTo(options: { url: string }): void;
  navigateBack(options?: { delta?: number }): void;
  setNavigationBarTitle(options: { title: string }): void;
  showToast(options: {
    title: string;
    icon?: "success" | "error" | "loading" | "none";
    duration?: number;
  }): void;
  showModal(options: {
    title: string;
    content: string;
    confirmText?: string;
    confirmColor?: string;
    success: (result: { confirm: boolean; cancel: boolean }) => void;
  }): void;
  saveVideoToPhotosAlbum(options: {
    filePath: string;
    success: () => void;
    fail: (error: unknown) => void;
  }): void;
  vibrateShort(options?: { type?: "heavy" | "medium" | "light" }): void;
}

declare const wx: WxApi;
declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;
