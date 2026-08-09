import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelSpeechPrompt,
  primeSpeechSynthesis,
  shouldPlayFramingPrompt,
  speakChinesePrompt,
} from "./audio";

class MockUtterance {
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pitch = 1;
  rate = 1;
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  volume = 1;

  constructor(text: string) {
    this.text = text;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("framing speech prompts", () => {
  it("waits before the first prompt and throttles repeats", () => {
    expect(shouldPlayFramingPrompt(1_399, 0, null)).toBe(false);
    expect(shouldPlayFramingPrompt(1_400, 0, null)).toBe(true);
    expect(shouldPlayFramingPrompt(10_399, 0, 1_400)).toBe(false);
    expect(shouldPlayFramingPrompt(10_400, 0, 1_400)).toBe(true);
  });

  it("primes speech silently inside the start interaction", () => {
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: {
        cancel,
        speak,
      },
    });

    primeSpeechSynthesis();

    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.lang).toBe("zh-CN");
    expect(utterance.volume).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("prefers a friendly female Mainland Chinese voice", () => {
    const chineseVoice = {
      lang: "zh-CN",
      name: "Microsoft Xiaoxiao Natural",
    } as SpeechSynthesisVoice;
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: {
        cancel,
        getVoices: () => [
          { lang: "en-US", name: "English" } as SpeechSynthesisVoice,
          { lang: "zh-CN", name: "Microsoft Kangkang" } as SpeechSynthesisVoice,
          chineseVoice,
        ],
        speak,
      },
    });

    speakChinesePrompt("向左");

    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe("向左");
    expect(utterance.lang).toBe("zh-CN");
    expect(utterance.voice).toBe(chineseVoice);
    expect(utterance.rate).toBe(1.03);
    expect(utterance.pitch).toBe(1.02);
  });

  it("cancels any queued prompt", () => {
    const cancel = vi.fn();
    vi.stubGlobal("window", {
      speechSynthesis: { cancel },
    });

    cancelSpeechPrompt();

    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps the closest Mandarin locale ahead of a dialect female voice", () => {
    const mainlandVoice = {
      lang: "zh-CN",
      name: "Microsoft Kangkang",
    } as SpeechSynthesisVoice;
    const speak = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: {
        cancel: vi.fn(),
        getVoices: () => [
          { lang: "zh-TW", name: "Mei-Jia" } as SpeechSynthesisVoice,
          mainlandVoice,
        ],
        speak,
      },
    });

    speakChinesePrompt("向右");

    expect((speak.mock.calls[0][0] as MockUtterance).voice).toBe(mainlandVoice);
  });

  it("ignores completion callbacks from canceled speech", () => {
    const speak = vi.fn();
    const onFinished = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: {
        cancel: vi.fn(),
        getVoices: () => [],
        speak,
      },
    });

    speakChinesePrompt("向左", onFinished);
    const utterance = speak.mock.calls[0][0] as MockUtterance;
    cancelSpeechPrompt();
    utterance.onend?.();

    expect(onFinished).not.toHaveBeenCalled();
  });

  it("silently falls back when an embedded browser blocks speech", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: {
        cancel: () => {
          throw new Error("blocked");
        },
        getVoices: () => [],
        speak: vi.fn(),
      },
    });

    expect(() => speakChinesePrompt("向后")).not.toThrow();
  });
});
