import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EXERCISES, type ExerciseId } from "@workout-detect/core/domain/exercises";
import type { CompletionStats } from "@workout-detect/core/domain/session";

import { CompletionScreen } from "./components/CompletionScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { SetupScreen } from "./components/SetupScreen";
import type { MainNavDestination } from "./components/MainNav";
import type { AvatarId } from "./domain/records";
import { primeAudio, primeSpeechSynthesis } from "./lib/audio";
import type { CompletedRecording } from "./lib/session-recorder";
import {
  saveWorkoutRecord,
  WorkoutRecordStoreError,
} from "./lib/workout-record-store";

const WorkoutScreen = lazy(() =>
  import("./components/WorkoutScreen").then((module) => ({
    default: module.WorkoutScreen,
  })),
);
const ExerciseDemoScreen = lazy(() =>
  import("./components/ExerciseDemoScreen").then((module) => ({
    default: module.ExerciseDemoScreen,
  })),
);
const FitnessScreen = lazy(() =>
  import("./components/FitnessScreen").then((module) => ({
    default: module.FitnessScreen,
  })),
);
const ExerciseLibraryScreen = lazy(() =>
  import("./components/ExerciseLibraryScreen").then((module) => ({
    default: module.ExerciseLibraryScreen,
  })),
);

type AppView =
  | "fitness"
  | "exercises"
  | "setup"
  | "profile"
  | "demo"
  | "workout"
  | "complete";

const initialExercise = EXERCISES[0];
const AVATAR_STORAGE_KEY = "workout-detect:recording-avatar:v1";
const PROFILE_STORAGE_KEY = "workout-detect:profile:v1";
const DEMO_DISMISSED_STORAGE_KEY = "workout-detect:exercise-demo-dismissed:v1";
const showCompletionPreview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "complete";
const previewStats: CompletionStats = {
  completedReps: initialExercise.defaultTarget,
  targetReps: initialExercise.defaultTarget,
  durationSeconds: 46,
  accuracy: 92,
};

function readSavedAvatar(): AvatarId {
  try {
    const value = window.localStorage.getItem(AVATAR_STORAGE_KEY);
    if (value === "man" || value === "woman") return value;
  } catch {
    // Private browsing or device policy can make localStorage unavailable.
  }
  return "none";
}

interface SavedProfile {
  username: string;
  image: string;
}

function readSavedProfile(): SavedProfile {
  try {
    const value = JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? "null") as Partial<SavedProfile> | null;
    return {
      username: typeof value?.username === "string" ? value.username.slice(0, 16) : "训练者",
      image: typeof value?.image === "string" && value.image.startsWith("data:image/") ? value.image : "",
    };
  } catch {
    return { username: "训练者", image: "" };
  }
}

function recordingErrorMessage(error: unknown): string {
  if (error instanceof WorkoutRecordStoreError) {
    if (error.code === "QUOTA_EXCEEDED") return "本机空间不足，录屏未保存";
    if (error.code === "UNSUPPORTED") return "当前浏览器无法保存录屏";
  }
  return "录屏保存失败";
}

function isDemoDismissed(): boolean {
  try {
    return window.localStorage.getItem(DEMO_DISMISSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function App() {
  const [view, setView] = useState<AppView>(showCompletionPreview ? "complete" : "setup");
  const [exerciseId, setExerciseId] = useState<ExerciseId>(initialExercise.id);
  const [target, setTarget] = useState<number>(initialExercise.defaultTarget);
  const [avatar, setAvatar] = useState<AvatarId>(readSavedAvatar);
  const [profile, setProfile] = useState<SavedProfile>(readSavedProfile);
  const [stats, setStats] = useState<CompletionStats | null>(
    showCompletionPreview ? previewStats : null,
  );
  const [recordingNotice, setRecordingNotice] = useState(
    showCompletionPreview ? "预览记录未保存" : "",
  );
  const [recordingSaving, setRecordingSaving] = useState(false);
  const saveTokenRef = useRef(0);

  useEffect(() => {
    if (
      view === "fitness" ||
      view === "exercises" ||
      view === "setup" ||
      view === "profile"
    ) {
      window.scrollTo({ top: 0, left: 0 });
    }
  }, [view]);

  const handleExerciseChange = (nextExerciseId: ExerciseId) => {
    const nextExercise = EXERCISES.find((exercise) => exercise.id === nextExerciseId);
    setExerciseId(nextExerciseId);

    if (nextExercise) {
      setTarget(nextExercise.defaultTarget);
    }
  };

  const handleMainNavigation = (destination: MainNavDestination) => {
    setView(destination === "workout" ? "setup" : destination);
  };

  const beginWorkout = () => {
    // Must happen in the click event so iOS allows later sound and speech cues.
    primeSpeechSynthesis();
    void primeAudio();
    saveTokenRef.current += 1;
    setStats(null);
    setRecordingNotice("");
    setRecordingSaving(false);
    setView("workout");
  };

  const handleStart = () => {
    if (isDemoDismissed()) {
      beginWorkout();
      return;
    }
    setView("demo");
  };

  const handleDemoStart = (skipNextTime: boolean) => {
    if (skipNextTime) {
      try {
        window.localStorage.setItem(DEMO_DISMISSED_STORAGE_KEY, "true");
      } catch {
        // The demo still closes when persistence is unavailable.
      }
    }
    beginWorkout();
  };

  const handleAvatarChange = (nextAvatar: AvatarId) => {
    setAvatar(nextAvatar);
    try {
      window.localStorage.setItem(AVATAR_STORAGE_KEY, nextAvatar);
    } catch {
      // The choice still applies to the current tab when persistence is blocked.
    }
  };

  const updateProfile = (next: Partial<SavedProfile>) => {
    setProfile((current) => {
      const value = { ...current, ...next };
      try {
        window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(value));
      } catch {
        // The setting still applies to the current tab when persistence is blocked.
      }
      return value;
    });
  };

  const handleComplete = async (
    nextStats: CompletionStats,
    recording: CompletedRecording | null,
  ) => {
    const reachedTarget = nextStats.completedReps >= nextStats.targetReps;
    const saveToken = ++saveTokenRef.current;
    setStats(reachedTarget ? nextStats : null);
    if (reachedTarget) setView("complete");

    if (!recording) {
      setRecordingNotice("当前浏览器无法录屏");
      setRecordingSaving(false);
      if (!reachedTarget) setView("setup");
      return;
    }

    setRecordingNotice("正在保存录屏…");
    setRecordingSaving(true);
    try {
      await saveWorkoutRecord({
        exerciseId,
        completedReps: nextStats.completedReps,
        targetReps: nextStats.targetReps,
        durationSeconds: nextStats.durationSeconds,
        avatar,
        video: recording.blob,
      });
      if (saveTokenRef.current === saveToken) {
        setRecordingNotice("录屏已存本机");
      }
      void navigator.storage?.persist?.().catch(() => undefined);
    } catch (error: unknown) {
      if (saveTokenRef.current === saveToken) {
        console.error("录屏保存失败", error);
        setRecordingNotice(recordingErrorMessage(error));
      }
    } finally {
      if (saveTokenRef.current === saveToken) {
        setRecordingSaving(false);
        if (!reachedTarget) setView("setup");
      }
    }
  };

  if (view === "workout") {
    return (
      <Suspense fallback={<WorkoutLoading />}>
        <WorkoutScreen
          exerciseId={exerciseId}
          target={target}
          avatar={avatar}
          onExit={() => setView("setup")}
          onComplete={handleComplete}
        />
      </Suspense>
    );
  }

  if (view === "demo") {
    return (
      <Suspense fallback={<DemoLoading />}>
        <ExerciseDemoScreen
          exerciseId={exerciseId}
          onBack={() => setView("setup")}
          onStart={handleDemoStart}
        />
      </Suspense>
    );
  }

  if (view === "complete" && stats) {
    return (
      <CompletionScreen
        exerciseId={exerciseId}
        stats={stats}
        recordingNotice={recordingNotice}
        recordingSaving={recordingSaving}
        onRepeat={handleStart}
        onOpenRecords={() => setView("fitness")}
      />
    );
  }

  if (view === "fitness") {
    return (
      <Suspense fallback={<RecordsLoading />}>
        <FitnessScreen
          onNavigate={handleMainNavigation}
        />
      </Suspense>
    );
  }

  if (view === "exercises") {
    return (
      <Suspense fallback={<CatalogLoading />}>
        <ExerciseLibraryScreen
          onNavigate={handleMainNavigation}
          onStartExercise={(nextExerciseId) => {
            handleExerciseChange(nextExerciseId);
            setView("setup");
          }}
        />
      </Suspense>
    );
  }

  if (view === "profile") {
    return (
      <ProfileScreen
        username={profile.username}
        profileImage={profile.image}
        recordingAvatar={avatar}
        onUsernameChange={(username) => updateProfile({ username })}
        onProfileImageChange={(image) => updateProfile({ image })}
        onRecordingAvatarChange={handleAvatarChange}
        onNavigate={handleMainNavigation}
      />
    );
  }

  return (
    <SetupScreen
      exerciseId={exerciseId}
      target={target}
      onExerciseChange={handleExerciseChange}
      onTargetChange={setTarget}
      onOpenFitness={() => setView("fitness")}
      onOpenExercises={() => setView("exercises")}
      onOpenProfile={() => setView("profile")}
      onStart={handleStart}
    />
  );
}

function WorkoutLoading() {
  return (
    <main className="route-loading" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <p>正在准备</p>
    </main>
  );
}

function RecordsLoading() {
  return (
    <main className="route-loading route-loading--light" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <p>正在读取记录</p>
    </main>
  );
}

function DemoLoading() {
  return (
    <main className="route-loading route-loading--light" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <p>正在准备动作演示</p>
    </main>
  );
}

function CatalogLoading() {
  return (
    <main className="route-loading route-loading--light" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <p>正在读取动作</p>
    </main>
  );
}
