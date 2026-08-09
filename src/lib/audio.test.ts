import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelSpeechPrompt,
  shouldPlayFramingPrompt,
  speakChinesePrompt,
} from "./audio";

class MockUtterance {
  lang = "";
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

  it("speaks with an available Mainland Chinese voice", () => {
    const chineseVoice = {
      lang: "zh-CN",
      name: "中文",
    } as SpeechSynthesisVoice;
    const cancel = vi.fn();
    const speak = vi.fn();
    vi.stubGlobal("SpeechSynthesisUtterance", MockUtterance);
    vi.stubGlobal("window", {
      speechSynthesis: {
        cancel,
        getVoices: () => [
          { lang: "en-US", name: "English" } as SpeechSynthesisVoice,
          chineseVoice,
        ],
        speak,
      },
    });

    speakChinesePrompt("让肩和膝进入画面");

    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
    const utterance = speak.mock.calls[0][0] as MockUtterance;
    expect(utterance.text).toBe("让肩和膝进入画面");
    expect(utterance.lang).toBe("zh-CN");
    expect(utterance.voice).toBe(chineseVoice);
  });

  it("cancels any queued prompt", () => {
    const cancel = vi.fn();
    vi.stubGlobal("window", {
      speechSynthesis: { cancel },
    });

    cancelSpeechPrompt();

    expect(cancel).toHaveBeenCalledOnce();
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

    expect(() => speakChinesePrompt("进入画面")).not.toThrow();
  });
});
