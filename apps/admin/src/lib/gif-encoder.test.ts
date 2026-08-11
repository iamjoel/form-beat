import { describe, expect, it } from "vitest";
import { encodeGif, rgbaToIndexed } from "./gif-encoder";

function readFirstFrame(gif: Uint8Array): Uint8Array {
  let offset = 6;
  const packed = gif[offset + 4];
  offset += 7;
  if ((packed & 0x80) !== 0) offset += 3 * (1 << ((packed & 0x07) + 1));

  while (gif[offset] !== 0x2c) {
    expect(gif[offset]).toBe(0x21);
    offset += 2;
    while (gif[offset] !== 0) {
      offset += gif[offset] + 1;
    }
    offset += 1;
  }

  offset += 10;
  const minimumCodeSize = gif[offset];
  offset += 1;
  const blocks: number[] = [];
  while (gif[offset] !== 0) {
    const length = gif[offset];
    offset += 1;
    for (let index = 0; index < length; index += 1) blocks.push(gif[offset + index]);
    offset += length;
  }

  const bytes = Uint8Array.from(blocks);
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let bitOffset = 0;
  let dictionary: Uint8Array[] = Array.from(
    { length: clearCode },
    (_, index) => Uint8Array.of(index),
  );
  let previous: Uint8Array | null = null;
  const result: number[] = [];

  const readCode = (): number => {
    let value = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      const absoluteBit = bitOffset + bit;
      value |= ((bytes[absoluteBit >> 3] >> (absoluteBit & 7)) & 1) << bit;
    }
    bitOffset += codeSize;
    return value;
  };

  while (bitOffset + codeSize <= bytes.length * 8) {
    const code = readCode();
    if (code === clearCode) {
      dictionary = Array.from({ length: clearCode }, (_, index) => Uint8Array.of(index));
      codeSize = minimumCodeSize + 1;
      nextCode = endCode + 1;
      previous = null;
      continue;
    }
    if (code === endCode) break;
    let entry: Uint8Array | null = null;
    if (code < dictionary.length) {
      entry = dictionary[code];
    } else if (code === nextCode && previous) {
      const prior = previous as Uint8Array;
      entry = Uint8Array.from([...prior, prior[0]]);
    }
    if (!entry) throw new Error(`Invalid LZW code ${code} at ${nextCode}`);
    result.push(...entry);
    if (previous && nextCode < 4096) {
      dictionary[nextCode] = Uint8Array.from([...previous, entry[0]]);
      nextCode += 1;
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }
  return Uint8Array.from(result);
}

describe("GIF encoder", () => {
  it("quantizes RGBA pixels into the global palette", () => {
    const indexed = rgbaToIndexed(
      new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
      ]),
    );
    expect([...indexed]).toEqual([224, 28, 3]);
  });

  it("writes an animated GIF89a stream", () => {
    const gif = encodeGif({
      width: 2,
      height: 2,
      frames: [
        { pixels: new Uint8Array([0, 1, 2, 3]), delayMs: 100 },
        { pixels: new Uint8Array([3, 2, 1, 0]), delayMs: 100 },
      ],
    });
    expect(new TextDecoder().decode(gif.subarray(0, 6))).toBe("GIF89a");
    expect(gif.at(-1)).toBe(0x3b);
    expect(gif.length).toBeGreaterThan(800);
  });

  it("round-trips image data across LZW code-size changes", () => {
    const pixels = Uint8Array.from(
      { length: 96 * 64 },
      (_, index) => (index * 73 + Math.floor(index / 17) * 29) & 0xff,
    );
    const gif = encodeGif({
      width: 96,
      height: 64,
      frames: [{ pixels, delayMs: 80 }],
    });
    expect(readFirstFrame(gif)).toEqual(pixels);
  });
});
