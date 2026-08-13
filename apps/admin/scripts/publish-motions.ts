import { fileURLToPath } from "node:url";
import { publishReadyMotions } from "../server/motion-publisher.ts";
import { MotionStore } from "../server/motion-store.ts";

const databasePath = process.env.FORM_BEAT_ADMIN_DB_PATH
  ?? fileURLToPath(new URL("../data/motions.sqlite", import.meta.url));
const outputPath = fileURLToPath(new URL(
  "../../../packages/core/src/generated/published-exercise-motions.ts",
  import.meta.url,
));

const store = new MotionStore(databasePath);
try {
  const result = publishReadyMotions(store, outputPath);
  console.log(JSON.stringify({
    publishedExerciseIds: result.exerciseIds,
    outputPath: result.outputPath,
    changed: result.changed,
  }, null, 2));
} finally {
  store.close();
}
