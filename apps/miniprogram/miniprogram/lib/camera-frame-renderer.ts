import { getCoverLayout, type RenderSize } from "./pose-renderer";

export interface RenderableCameraFrame extends RenderSize {
  data: ArrayBuffer;
}

/**
 * Draws the exact RGBA frame sent to VisionKit. The native camera component
 * can crop its preview differently from onCameraFrame, so it stays mounted for
 * recording while this synchronized canvas becomes the visible preview.
 */
export class CameraFrameRenderer {
  private bufferCanvas?: OffscreenCanvas;
  private bufferContext?: OffscreenCanvasRenderingContext2D;
  private imageData?: ImageData;

  draw(
    target: CanvasRenderingContext2D,
    frame: RenderableCameraFrame,
    display: RenderSize,
  ): void {
    if (
      frame.width <= 0 ||
      frame.height <= 0 ||
      display.width <= 0 ||
      display.height <= 0
    ) {
      return;
    }

    this.ensureBuffer(frame.width, frame.height);
    const pixels = new Uint8ClampedArray(frame.data);
    const expectedLength = frame.width * frame.height * 4;
    if (pixels.length < expectedLength) {
      throw new Error("CAMERA_FRAME_RGBA_LENGTH_MISMATCH");
    }

    this.imageData!.data.set(pixels.subarray(0, expectedLength));
    this.bufferContext!.putImageData(this.imageData!, 0, 0);

    const { renderedWidth, renderedHeight, offsetX, offsetY } = getCoverLayout(
      frame,
      display,
    );
    target.clearRect(0, 0, display.width, display.height);
    target.save();
    target.translate(display.width, 0);
    target.scale(-1, 1);
    target.drawImage(
      this.bufferCanvas!,
      offsetX,
      offsetY,
      renderedWidth,
      renderedHeight,
    );
    target.restore();
  }

  private ensureBuffer(width: number, height: number): void {
    if (
      this.bufferCanvas &&
      this.bufferContext &&
      this.imageData &&
      this.bufferCanvas.width === width &&
      this.bufferCanvas.height === height
    ) {
      return;
    }

    const canvas = wx.createOffscreenCanvas({ type: "2d", width, height });
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CAMERA_FRAME_CANVAS_UNAVAILABLE");

    this.bufferCanvas = canvas;
    this.bufferContext = context;
    this.imageData = context.createImageData(width, height);
  }
}
