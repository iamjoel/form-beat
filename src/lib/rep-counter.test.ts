import { describe, expect, it } from "vitest";
import type { ExerciseId } from "../domain/exercises";
import {
  advanceRepCounter,
  createRepCounterState,
  type FormClassification,
  type RepCounterState,
} from "./rep-counter";

const pose = (overrides: Partial<FormClassification>): FormClassification => ({
  valid: true,
  start: false,
  end: false,
  quality: 0.92,
  metric: 120,
  feedback: "继续",
  ...overrides,
});

function feed(
  exerciseId: ExerciseId,
  state: RepCounterState,
  frames: readonly [number, FormClassification][],
): RepCounterState {
  return frames.reduce(
    (current, [timestamp, classification]) =>
      advanceRepCounter(exerciseId, current, classification, timestamp).state,
    state,
  );
}

const validWarmup: readonly [number, FormClassification][] = [
  [0, pose({ start: true })],
  [100, pose({ start: true })],
  [200, pose({ start: true })],
  [360, pose({ start: true })],
];

describe("advanceRepCounter", () => {
  it("counts only after a held start → held end → held start cycle", () => {
    const state = feed("squat", createRepCounterState(), [
      ...validWarmup,
      [430, pose({})],
      [650, pose({ end: true })],
      [790, pose({ end: true })],
      [900, pose({})],
      [1_050, pose({ start: true })],
      [1_220, pose({ start: true })],
    ]);

    expect(state.count).toBe(1);
    expect(state.phase).toBe("ready");
  });

  it("does not double count while the user remains at the start position", () => {
    const oneRep = feed("jumping-jack", createRepCounterState(), [
      ...validWarmup,
      [420, pose({})],
      [600, pose({ end: true })],
      [740, pose({ end: true })],
      [850, pose({})],
      [1_000, pose({ start: true })],
      [1_160, pose({ start: true })],
    ]);
    const held = feed("jumping-jack", oneRep, [
      [1_300, pose({ start: true })],
      [1_600, pose({ start: true })],
      [2_000, pose({ start: true })],
    ]);

    expect(held.count).toBe(1);
  });

  it("cancels a partial cycle after pose visibility is lost", () => {
    const state = feed("push-up", createRepCounterState(), [
      ...validWarmup,
      [430, pose({})],
      [600, pose({ end: true })],
      [700, pose({ valid: false, quality: 0.2 })],
      [900, pose({ valid: false, quality: 0.2 })],
      [1_100, pose({ start: true })],
      [1_300, pose({ start: true })],
    ]);

    expect(state.count).toBe(0);
    expect(state.phase).not.toBe("end-held");
  });

  it("rejects implausibly fast squat cycles", () => {
    const state = feed("squat", createRepCounterState(), [
      ...validWarmup,
      [400, pose({})],
      [430, pose({ end: true })],
      [560, pose({ end: true })],
      [600, pose({ start: true })],
      [760, pose({ start: true })],
    ]);

    expect(state.count).toBe(0);
  });
});

