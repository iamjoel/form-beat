import { describe, expect, it, vi } from "vitest";
import {
  applyCameraDevice,
  applyWidestCameraView,
  findWiderCameraDevice,
  minimumCameraZoom,
} from "./camera";

describe("findWiderCameraDevice", () => {
  it("selects an explicitly front-facing ultra-wide camera", () => {
    expect(
      findWiderCameraDevice(
        [
          { deviceId: "front", label: "Front Camera" },
          { deviceId: "rear-ultra", label: "Back Ultra Wide Camera" },
          { deviceId: "front-ultra", label: "Front 0.5x Camera" },
        ],
        "front",
        "user",
      ),
    ).toBe("front-ultra");
  });

  it("never substitutes an opposite-facing ultra-wide camera", () => {
    expect(
      findWiderCameraDevice(
        [
          { deviceId: "front", label: "前置相机" },
          {
            deviceId: "rear-ultra",
            label: "后置超广角相机",
            facingModes: ["user"],
          },
        ],
        "front",
        "user",
      ),
    ).toBeNull();
  });

  it("uses facing capability data when labels only describe the lens", () => {
    expect(
      findWiderCameraDevice(
        [
          { deviceId: "front", label: "Camera 1" },
          {
            deviceId: "front-ultra",
            label: "Ultra_Wide 0,5×",
            facingModes: ["user"],
          },
        ],
        "front",
        "user",
      ),
    ).toBe("front-ultra");
  });
});

describe("applyCameraDevice", () => {
  it("switches the active track while preserving its other constraints", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      getConstraints: () => ({ facingMode: "user", frameRate: 30 }),
      applyConstraints,
    } as unknown as MediaStreamTrack;

    await expect(applyCameraDevice(track, "front-ultra")).resolves.toBe(true);
    expect(applyConstraints).toHaveBeenCalledWith({
      facingMode: "user",
      frameRate: 30,
      deviceId: { exact: "front-ultra" },
    });
  });

  it("keeps the current camera when switching is rejected", async () => {
    const track = {
      getConstraints: () => ({ facingMode: "user" }),
      applyConstraints: vi.fn().mockRejectedValue(new Error("unsupported")),
    } as unknown as MediaStreamTrack;

    await expect(applyCameraDevice(track, "front-ultra")).resolves.toBe(false);
  });
});

describe("minimumCameraZoom", () => {
  it("reads the minimum supported hardware zoom", () => {
    expect(
      minimumCameraZoom({
        zoom: { min: 0.5, max: 4, step: 0.1 },
      } as MediaTrackCapabilities),
    ).toBe(0.5);
  });

  it("returns null when the browser does not expose zoom", () => {
    expect(minimumCameraZoom({} as MediaTrackCapabilities)).toBeNull();
  });

  it("rejects a malformed zoom range", () => {
    expect(
      minimumCameraZoom({
        zoom: { min: 3, max: 1 },
      } as MediaTrackCapabilities),
    ).toBeNull();
  });
});

describe("applyWidestCameraView", () => {
  it("preserves current constraints and applies the minimum zoom", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      getCapabilities: () => ({ zoom: { min: 0.5, max: 3 } }),
      getSettings: () => ({ zoom: 1 }),
      getConstraints: () => ({ facingMode: "user", frameRate: 30 }),
      applyConstraints,
    } as unknown as MediaStreamTrack;

    await expect(applyWidestCameraView(track)).resolves.toBe(true);
    expect(applyConstraints).toHaveBeenCalledWith({
      facingMode: "user",
      frameRate: 30,
      advanced: [{ zoom: 0.5 }],
    });
  });

  it("does nothing when the current track is already at minimum zoom", async () => {
    const applyConstraints = vi.fn();
    const track = {
      getCapabilities: () => ({ zoom: { min: 1, max: 4 } }),
      getSettings: () => ({ zoom: 1 }),
      getConstraints: () => ({}),
      applyConstraints,
    } as unknown as MediaStreamTrack;

    await expect(applyWidestCameraView(track)).resolves.toBe(true);
    expect(applyConstraints).not.toHaveBeenCalled();
  });

  it("falls back silently when applying zoom is rejected", async () => {
    const track = {
      getCapabilities: () => ({ zoom: { min: 0.5, max: 2 } }),
      getSettings: () => ({ zoom: 1 }),
      getConstraints: () => ({}),
      applyConstraints: vi.fn().mockRejectedValue(new Error("unsupported")),
    } as unknown as MediaStreamTrack;

    await expect(applyWidestCameraView(track)).resolves.toBe(false);
  });
});
