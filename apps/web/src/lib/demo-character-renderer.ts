import {
  EXERCISE_DEMO_SPRITE_CROPS,
  type HuskySpriteAssetId,
} from "@workout-detect/core/lib/exercise-demo";
import type {
  MotionFrame,
  MotionProject,
} from "@workout-detect/core/lib/motion-project";

export interface DemoCharacterRenderer {
  draw(
    context: CanvasRenderingContext2D,
    project: MotionProject,
    frame: MotionFrame,
    width: number,
    height: number,
  ): void;
}

/**
 * Compatibility renderer for the current flattened two-frame husky art.
 * A layered-rig renderer can implement the same interface and consume
 * frame.landmarks instead of switching full bitmaps.
 */
export function createHuskySpriteRenderer(
  sprites: Partial<Record<HuskySpriteAssetId, HTMLImageElement>>,
): DemoCharacterRenderer {
  return {
    draw(context, project, frame, width, height) {
      const character = project.character;
      if (character?.renderer === "layered-rig") return;
      const crop = EXERCISE_DEMO_SPRITE_CROPS[project.reference.exerciseId];
      if (character?.assetId && character.assetId !== crop.assetId) return;
      const sprite = sprites[crop.assetId];
      if (!sprite) return;
      const sourceWidth = sprite.naturalWidth / 2;
      const sourceY = crop.sourceY * sprite.naturalHeight;
      const sourceHeight = Math.min(
        crop.sourceHeight * sprite.naturalHeight,
        sprite.naturalHeight - sourceY,
      );
      context.save();
      context.globalAlpha = project.reference.opacity;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      if (crop.mirror) {
        context.translate(width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(
        sprite,
        frame.referenceFrame * sourceWidth,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        width,
        height,
      );
      context.restore();
    },
  };
}
