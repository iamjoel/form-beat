---
name: create-fitness-motion
description: Create a new fitness motion record in the Form Beat Admin SQLite database through its local HTTP API. Use when the user asks to add, create, seed, or import a workout/fitness action, motion project, pose animation, or `.motion.json` record for the Admin Motion Lab.
---

# Create Fitness Motion

Create one validated Motion Lab record and return its ID plus editor URL. Always use the Admin API; do not edit the SQLite file directly.

## Workflow

1. Confirm the Admin server is reachable at `http://localhost:5174` unless the user supplied another URL.
2. Derive a concise Chinese motion name from the request. Choose one supported exercise ID:
   - `squat`
   - `push-up`
   - `jumping-jack`
   - `lunge`
3. Use `scripts/create_motion.mjs` to create the record.
4. Verify that the script returns `motionId` and `editorUrl`.
5. Report the created name, ID, and editor URL. Mention that the starter pose can be refined in Motion Lab.

## Quick creation

Run from this skill directory:

```bash
node scripts/create_motion.mjs \
  --name "深蹲节奏训练" \
  --exercise squat \
  --duration 2800
```

Options:

- `--base-url`: Admin origin; defaults to `http://localhost:5174`.
- `--name`: Required for starter records.
- `--exercise`: Defaults to `squat`.
- `--duration`: Milliseconds from 300 through 30000; defaults to 2800.
- `--status`: `draft` or `ready`; defaults to `draft`.
- `--dry-run`: Print the validated request without writing data.

The API-generated starter pose is intentionally editable. For a precise custom skeleton, prepare or reuse an exported Motion Lab JSON file and import it instead.

## Import an existing motion project

```bash
node scripts/create_motion.mjs --project /absolute/path/to/action.motion.json
```

The project must follow [references/motion-schema.md](references/motion-schema.md). Use an absolute path when possible. `--status ready` is appropriate only when the pose, timing, annotations, and GIF preview have been reviewed.

## Failure handling

- If the request cannot connect, tell the user to run `pnpm admin:dev`, then retry.
- If the API rejects a project, preserve the error message and fix the input rather than bypassing validation.
- Never silently create a different exercise type when the requested type is unsupported. Ask for the closest supported template or create a custom `.motion.json` project.
