# Motion Lab project schema

The Admin API stores a complete `MotionProject` JSON object in SQLite. The current schema version is `1`.

## Required top-level fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `1` | Data version |
| `name` | string | Human-readable motion name |
| `durationMs` | number | Total duration, 300–30000 ms |
| `easing` | `linear`, `ease-in-out`, or `ease-out` | Keyframe interpolation |
| `loop` | boolean | Repeat during playback/export |
| `canvas` | `{ width, height }` | Source canvas dimensions |
| `reference` | object | Exercise ID, visibility, and opacity |
| `display` | object | Skeleton, joints, and angle visibility |
| `skeleton.connections` | `[number, number][]` | Active joint segments |
| `keyframes` | array | One or more pose keyframes |
| `annotations` | array | Zero or more three-joint angle labels |

Each keyframe needs an `id`, `name`, `timeMs`, `referenceFrame` (`0` or `1`), and exactly 33 MediaPipe pose points. A point contains normalized `x` and `y`, optional `z`, and `visibility`.

Removed skeleton connections remain absent from `skeleton.connections`. A joint with no active connection is hidden in clean GIF output.

## API

- `POST /api/motions`: create from `{ name, exerciseId, durationMs, status }` or `{ project, status }`.
- `GET /api/motions`: list metadata; optional `?q=` search.
- `GET /api/motions/:id`: read full project.
- `PUT /api/motions/:id`: replace project and optionally update status.

Supported starter exercise IDs are `squat`, `push-up`, `jumping-jack`, and `lunge`.
