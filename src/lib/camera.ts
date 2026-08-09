interface ZoomRangeLike {
  min?: unknown;
  max?: unknown;
}

type ZoomCapabilities = MediaTrackCapabilities & {
  zoom?: number | ZoomRangeLike;
};

type ZoomSettings = MediaTrackSettings & {
  zoom?: number;
};

type ZoomConstraintSet = MediaTrackConstraintSet & {
  zoom?: number;
};

export interface CameraCandidate {
  deviceId: string;
  label: string;
  facingModes?: readonly string[];
}

const FRONT_CAMERA_PATTERN = /(?:front|user|facetime|前置|前摄|自拍)/i;
const REAR_CAMERA_PATTERN = /(?:back|rear|environment|后置|后摄|主摄)/i;
const ULTRA_WIDE_PATTERN =
  /(?:ultra[\s_-]*wide|0[.,]5\s*[x×]|超广角|超廣角)/i;

function hasFacingMode(
  candidate: CameraCandidate,
  facing: "user" | "environment",
): boolean {
  const wantedPattern =
    facing === "user" ? FRONT_CAMERA_PATTERN : REAR_CAMERA_PATTERN;
  const oppositePattern =
    facing === "user" ? REAR_CAMERA_PATTERN : FRONT_CAMERA_PATTERN;
  if (oppositePattern.test(candidate.label)) return false;
  if (candidate.facingModes?.includes(facing)) return true;
  return wantedPattern.test(candidate.label);
}

/** Returns a different, explicitly same-facing ultra-wide camera when exposed. */
export function findWiderCameraDevice(
  candidates: readonly CameraCandidate[],
  currentDeviceId: string | undefined,
  facing: "user" | "environment",
): string | null {
  const current = candidates.find(
    (candidate) => candidate.deviceId === currentDeviceId,
  );
  if (current && ULTRA_WIDE_PATTERN.test(current.label)) return null;

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.deviceId || seen.has(candidate.deviceId)) continue;
    seen.add(candidate.deviceId);
    if (candidate.deviceId === currentDeviceId) continue;
    if (!ULTRA_WIDE_PATTERN.test(candidate.label)) continue;
    if (hasFacingMode(candidate, facing)) return candidate.deviceId;
  }
  return null;
}

export async function applyCameraDevice(
  track: MediaStreamTrack,
  deviceId: string,
): Promise<boolean> {
  if (!deviceId) return false;
  try {
    await track.applyConstraints({
      ...track.getConstraints(),
      deviceId: { exact: deviceId },
    });
    return true;
  } catch {
    return false;
  }
}

export function minimumCameraZoom(
  capabilities: MediaTrackCapabilities,
): number | null {
  const zoom = (capabilities as ZoomCapabilities).zoom;
  const minimum =
    typeof zoom === "number"
      ? zoom
      : zoom && typeof zoom === "object"
        ? zoom.min
        : undefined;
  const maximum =
    zoom && typeof zoom === "object" && "max" in zoom ? zoom.max : undefined;

  return typeof minimum === "number" &&
    Number.isFinite(minimum) &&
    minimum > 0 &&
    !(
      typeof maximum === "number" &&
      Number.isFinite(maximum) &&
      minimum > maximum
    )
    ? minimum
    : null;
}

/**
 * Uses the widest view exposed by the current physical/virtual camera.
 * Unsupported image-capture constraints are deliberately treated as a no-op.
 */
export async function applyWidestCameraView(
  track: MediaStreamTrack,
): Promise<boolean> {
  if (typeof track.getCapabilities !== "function") return false;

  try {
    const minimumZoom = minimumCameraZoom(track.getCapabilities());
    if (minimumZoom === null) return false;

    const currentZoom = (track.getSettings() as ZoomSettings).zoom;
    if (
      typeof currentZoom === "number" &&
      Math.abs(currentZoom - minimumZoom) < 0.001
    ) {
      return true;
    }

    const currentConstraints = track.getConstraints();
    const advanced = [
      ...(currentConstraints.advanced ?? []),
      { zoom: minimumZoom } as ZoomConstraintSet,
    ];
    await track.applyConstraints({
      ...currentConstraints,
      advanced,
    });
    return true;
  } catch {
    return false;
  }
}
