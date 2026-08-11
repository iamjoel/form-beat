export interface GifIndexedFrame {
  pixels: Uint8Array;
  delayMs: number;
}

export interface GifEncodeOptions {
  width: number;
  height: number;
  frames: readonly GifIndexedFrame[];
  loop?: boolean;
}

const PALETTE = (() => {
  const palette = new Uint8Array(256 * 3);
  for (let index = 0; index < 256; index += 1) {
    const red = (index >> 5) & 0x07;
    const green = (index >> 2) & 0x07;
    const blue = index & 0x03;
    palette[index * 3] = Math.round((red / 7) * 255);
    palette[index * 3 + 1] = Math.round((green / 7) * 255);
    palette[index * 3 + 2] = Math.round((blue / 3) * 255);
  }
  return palette;
})();

export function rgbaToIndexed(rgba: Uint8ClampedArray): Uint8Array {
  const indexed = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
    const alpha = rgba[source + 3] / 255;
    const red = Math.round(rgba[source] * alpha + 238 * (1 - alpha));
    const green = Math.round(rgba[source + 1] * alpha + 237 * (1 - alpha));
    const blue = Math.round(rgba[source + 2] * alpha + 229 * (1 - alpha));
    indexed[target] = (red & 0xe0) | ((green & 0xe0) >> 3) | (blue >> 6);
  }
  return indexed;
}

class ByteWriter {
  private readonly bytes: number[] = [];

  byte(value: number): void {
    this.bytes.push(value & 0xff);
  }

  bytesFrom(values: ArrayLike<number>): void {
    for (let index = 0; index < values.length; index += 1) this.byte(values[index]);
  }

  text(value: string): void {
    for (let index = 0; index < value.length; index += 1) this.byte(value.charCodeAt(index));
  }

  short(value: number): void {
    this.byte(value);
    this.byte(value >> 8);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function lzwEncode(indices: Uint8Array): Uint8Array {
  const minimumCodeSize = 8;
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let nextCode = endCode + 1;
  let codeSize = minimumCodeSize + 1;
  let bitBuffer = 0;
  let bitCount = 0;
  const output: number[] = [];
  const dictionary = new Map<number, number>();

  const writeCode = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  const resetDictionary = (): void => {
    dictionary.clear();
    nextCode = endCode + 1;
    codeSize = minimumCodeSize + 1;
  };

  writeCode(clearCode);
  if (indices.length === 0) {
    writeCode(endCode);
  } else {
    let prefix = indices[0];
    for (let index = 1; index < indices.length; index += 1) {
      const suffix = indices[index];
      const key = (prefix << 8) | suffix;
      const existing = dictionary.get(key);
      if (existing !== undefined) {
        prefix = existing;
        continue;
      }

      writeCode(prefix);
      if (nextCode < 4096) {
        dictionary.set(key, nextCode);
        nextCode += 1;
        // The decoder creates each dictionary entry one emitted code later than
        // the encoder, so keep the old width for one additional code.
        if (nextCode === (1 << codeSize) + 1 && codeSize < 12) codeSize += 1;
      } else {
        writeCode(clearCode);
        resetDictionary();
      }
      prefix = suffix;
    }
    writeCode(prefix);
    writeCode(endCode);
  }
  if (bitCount > 0) output.push(bitBuffer & 0xff);
  return Uint8Array.from(output);
}

function writeSubBlocks(writer: ByteWriter, data: Uint8Array): void {
  for (let offset = 0; offset < data.length; offset += 255) {
    const length = Math.min(255, data.length - offset);
    writer.byte(length);
    writer.bytesFrom(data.subarray(offset, offset + length));
  }
  writer.byte(0);
}

export function encodeGif(options: GifEncodeOptions): Uint8Array {
  const { width, height, frames, loop = true } = options;
  if (width < 1 || height < 1 || width > 65_535 || height > 65_535) {
    throw new Error("GIF 尺寸超出范围");
  }
  if (frames.length === 0) throw new Error("GIF 至少需要一帧");
  const pixelCount = width * height;
  const writer = new ByteWriter();

  writer.text("GIF89a");
  writer.short(width);
  writer.short(height);
  writer.byte(0xf7);
  writer.byte(0);
  writer.byte(0);
  writer.bytesFrom(PALETTE);

  if (loop) {
    writer.byte(0x21);
    writer.byte(0xff);
    writer.byte(11);
    writer.text("NETSCAPE2.0");
    writer.byte(3);
    writer.byte(1);
    writer.short(0);
    writer.byte(0);
  }

  for (const frame of frames) {
    if (frame.pixels.length !== pixelCount) throw new Error("GIF 帧尺寸不一致");
    writer.byte(0x21);
    writer.byte(0xf9);
    writer.byte(4);
    writer.byte(0x04);
    writer.short(Math.max(1, Math.round(frame.delayMs / 10)));
    writer.byte(0);
    writer.byte(0);

    writer.byte(0x2c);
    writer.short(0);
    writer.short(0);
    writer.short(width);
    writer.short(height);
    writer.byte(0);
    writer.byte(8);
    writeSubBlocks(writer, lzwEncode(frame.pixels));
  }

  writer.byte(0x3b);
  return writer.finish();
}
