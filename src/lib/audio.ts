let audioContext: AudioContext | null = null;

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
  const context = getAudioContext();
  if (context?.state === "suspended") await context.resume();
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

