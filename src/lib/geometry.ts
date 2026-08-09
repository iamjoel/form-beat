export interface PosePoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

function vector(
  from: PosePoint,
  to: PosePoint,
  size?: FrameSize,
): [number, number, number] {
  const scaleX = size?.width ?? 1;
  const scaleY = size?.height ?? 1;

  return [
    (to.x - from.x) * scaleX,
    (to.y - from.y) * scaleY,
    (to.z ?? 0) - (from.z ?? 0),
  ];
}

export function jointAngle(
  a: PosePoint,
  vertex: PosePoint,
  c: PosePoint,
  size?: FrameSize,
): number {
  const [abX, abY, abZ] = vector(vertex, a, size);
  const [cbX, cbY, cbZ] = vector(vertex, c, size);
  const dot = abX * cbX + abY * cbY + abZ * cbZ;
  const abLength = Math.hypot(abX, abY, abZ);
  const cbLength = Math.hypot(cbX, cbY, cbZ);

  if (abLength === 0 || cbLength === 0) return 0;

  const cosine = Math.min(1, Math.max(-1, dot / (abLength * cbLength)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function pointDistance(
  a: PosePoint,
  b: PosePoint,
  size?: FrameSize,
): number {
  const [x, y, z] = vector(a, b, size);
  return Math.hypot(x, y, z);
}

export function axisAngleFromHorizontal(
  a: PosePoint,
  b: PosePoint,
  size: FrameSize,
): number {
  const x = Math.abs((b.x - a.x) * size.width);
  const y = Math.abs((b.y - a.y) * size.height);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

