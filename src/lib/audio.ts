let audioContext: AudioContext | null = null;
let speechGeneration = 0;

export type SpokenDirection = "向前" | "向后" | "向左" | "向右";

const FRAMING_PROMPT_DELAY_MS = 1_400;
const FRAMING_PROMPT_REPEAT_MS = 9_000;
const FRIENDLY_FEMALE_VOICE_NAMES = [
  "xiaoxiao",
  "晓晓",
  "xiaoyi",
  "晓伊",
  "tingting",
  "婷婷",
  "huihui",
  "慧慧",
  "yaoyao",
  "瑶瑶",
  "meijia",
  "美佳",
] as const;
const KNOWN_MALE_VOICE_NAMES = [
  "kangkang",
  "康康",
  "yunxi",
  "云希",
  "yunjian",
  "云健",
  "yunyang",
  "云扬",
  "yunfeng",
  "云枫",
  "limu",
] as const;

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  return window.speechSynthesis;
}

function findChineseVoice(
  synthesis: SpeechSynthesis,
): SpeechSynthesisVoice | undefined {
  let bestVoice: SpeechSynthesisVoice | undefined;
  let bestLanguageTier = Infinity;
  let bestScore = -Infinity;
  for (const voice of synthesis.getVoices()) {
    const language = voice.lang.toLowerCase().replaceAll("_", "-");
    let languageTier: number;
    if (language === "zh-cn" || language.startsWith("zh-cn-")) {
      languageTier = 0;
    } else if (
      language === "zh-hans-cn" ||
      language === "cmn-cn" ||
      language === "zh-hans" ||
      language === "cmn"
    ) {
      languageTier = 1;
    } else if (
      (language.startsWith("zh") &&
        !language.startsWith("zh-tw") &&
        !language.startsWith("zh-hk")) ||
      language.startsWith("cmn")
    ) {
      languageTier = 2;
    } else {
      continue;
    }

    let score = 0;

    const normalizedName = voice.name
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s\-_()（）]/g, "");
    if (
      FRIENDLY_FEMALE_VOICE_NAMES.some((name) =>
        normalizedName.includes(name),
      )
    ) {
      score += 35;
    } else if (
      normalizedName.includes("female") ||
      normalizedName.includes("woman") ||
      normalizedName.includes("女声") ||
      normalizedName.includes("女聲")
    ) {
      score += 20;
    }
    if (
      KNOWN_MALE_VOICE_NAMES.some((name) => normalizedName.includes(name))
    ) {
      score -= 35;
    }
    if (
      normalizedName.includes("natural") ||
      normalizedName.includes("enhanced") ||
      normalizedName.includes("自然")
    ) {
      score += 8;
    }
    if (voice.localService) score += 6;
    if (voice.default) score += 3;

    if (
      languageTier < bestLanguageTier ||
      (languageTier === bestLanguageTier && score > bestScore)
    ) {
      bestVoice = voice;
      bestLanguageTier = languageTier;
      bestScore = score;
    }
  }
  return bestVoice;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  return audioContext;
}

export async function primeAudio(): Promise<void> {
  try {
    getSpeechSynthesis()?.getVoices();
  } catch {
    // Speech synthesis is optional; keep the existing audio cues available.
  }
  const context = getAudioContext();
  if (context?.state === "suspended") await context.resume();
}

export function primeSpeechSynthesis(): void {
  const synthesis = getSpeechSynthesis();
  if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") return;

  try {
    speechGeneration += 1;
    const utterance = new SpeechSynthesisUtterance("向后");
    utterance.lang = "zh-CN";
    utterance.volume = 0;
    synthesis.speak(utterance);
    synthesis.cancel();
  } catch {
    // Speech remains an optional enhancement in restricted webviews.
  }
}

export function shouldPlayFramingPrompt(
  now: number,
  missingSince: number,
  lastPromptAt: number | null,
): boolean {
  return (
    now - missingSince >= FRAMING_PROMPT_DELAY_MS &&
    (lastPromptAt === null || now - lastPromptAt >= FRAMING_PROMPT_REPEAT_MS)
  );
}

export function speakChinesePrompt(
  message: SpokenDirection,
  onFinished?: () => void,
): void {
  const synthesis = getSpeechSynthesis();
  const text = message.trim();
  if (
    !synthesis ||
    !text ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) {
    return;
  }

  try {
    const generation = ++speechGeneration;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = findChineseVoice(synthesis);
    utterance.lang = voice?.lang ?? "zh-CN";
    utterance.rate = 1.03;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    if (onFinished) {
      const finishCurrentSpeech = () => {
        if (generation === speechGeneration) onFinished();
      };
      utterance.onend = finishCurrentSpeech;
      utterance.onerror = finishCurrentSpeech;
    }

    synthesis.cancel();
    synthesis.speak(utterance);
  } catch {
    // Some embedded browsers expose the API but block playback.
  }
}

export function cancelSpeechPrompt(): void {
  speechGeneration += 1;
  try {
    getSpeechSynthesis()?.cancel();
  } catch {
    // Treat unsupported or blocked speech synthesis as a silent fallback.
  }
}

function tone(
  frequency: number,
  startsAt: number,
  duration: number,
  volume = 0.11,
): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.02);
}

export function playRepCue(rep: number): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const emphasis = rep % 5 === 0;
  tone(emphasis ? 1_046.5 : 880, context.currentTime, 0.12, emphasis ? 0.15 : 0.11);
  if (emphasis) tone(1_318.5, context.currentTime + 0.09, 0.14, 0.12);
  navigator.vibrate?.(35);
}

export function playCompletionCue(): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  tone(659.25, now, 0.16, 0.12);
  tone(880, now + 0.12, 0.18, 0.13);
  tone(1_318.5, now + 0.26, 0.3, 0.14);
  navigator.vibrate?.([45, 45, 90]);
}
