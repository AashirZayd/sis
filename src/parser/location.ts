import type { SourceLocation } from "../core/types.js";

/**
 * Maps SWC span positions to 1-indexed line and column numbers.
 *
 * SWC reports positions as 1-based UTF-8 *byte* offsets, and excludes a leading
 * byte-order mark. JavaScript strings are indexed in UTF-16 code units, so a
 * byte offset cannot be used as a string index once non-ASCII text precedes it
 * (audit V-12). This locator keeps a per-line table of both UTF-8 byte offsets
 * and UTF-16 indices and converts between them.
 *
 * Reported columns are 1-based and counted in UTF-16 code units, matching
 * JavaScript string indexing and editor conventions. A leading BOM is not
 * counted. Lines are delimited by "\n" (a "\r" before it is part of the line).
 */
export class SourceMapLocator {
  /** Source text as SWC sees it: without a leading byte-order mark. */
  private readonly text: string;
  /** UTF-16 index of each line start in `text`. */
  private readonly lineStartUnits: number[] = [0];
  /** UTF-8 byte offset of each line start in `text`. */
  private readonly lineStartBytes: number[] = [0];
  /** Whether each line consists solely of ASCII (byte offset == UTF-16 offset). */
  private readonly lineIsAscii: boolean[] = [];

  constructor(
    readonly file: string,
    readonly source: string
  ) {
    this.text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

    let bytes = 0;
    let ascii = true;
    const text = this.text;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) {
        bytes += 1;
      } else {
        ascii = false;
        if (code < 0x800) {
          bytes += 2;
        } else if (isHighSurrogate(code) && i + 1 < text.length && isLowSurrogate(text.charCodeAt(i + 1))) {
          bytes += 4;
          i++;
          continue;
        } else {
          // Other BMP characters, and lone surrogates (encoded as U+FFFD, 3 bytes).
          bytes += 3;
        }
      }

      if (code === 10) {
        this.lineIsAscii.push(ascii);
        ascii = true;
        this.lineStartUnits.push(i + 1);
        this.lineStartBytes.push(bytes);
      }
    }
    this.lineIsAscii.push(ascii);
  }

  /**
   * Converts a 1-based SWC byte position into a SourceLocation.
   */
  getLocation(byteOffset: number): SourceLocation {
    const targetByte = Math.max(0, byteOffset - 1);

    // Binary search for the last line starting at or before the target byte.
    let low = 0;
    let high = this.lineStartBytes.length - 1;
    let lineIdx = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.lineStartBytes[mid] <= targetByte) {
        lineIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const lineStartByte = this.lineStartBytes[lineIdx];
    const lineStartUnit = this.lineStartUnits[lineIdx];
    const lineEndUnit =
      lineIdx + 1 < this.lineStartUnits.length ? this.lineStartUnits[lineIdx + 1] - 1 : this.text.length;

    let unitOffset: number;
    if (this.lineIsAscii[lineIdx]) {
      unitOffset = Math.min(targetByte - lineStartByte, lineEndUnit - lineStartUnit);
    } else {
      unitOffset = this.bytesToUnits(lineStartUnit, lineEndUnit, targetByte - lineStartByte);
    }

    return {
      file: this.file,
      line: lineIdx + 1,
      column: unitOffset + 1,
    };
  }

  /**
   * Walks code points from `startUnit` until `byteDelta` UTF-8 bytes are consumed,
   * returning the number of UTF-16 code units walked. Stops at the code point that
   * contains the target byte if the offset falls inside a multi-byte sequence.
   */
  private bytesToUnits(startUnit: number, endUnit: number, byteDelta: number): number {
    const text = this.text;
    let unit = startUnit;
    let bytes = 0;
    while (unit < endUnit) {
      const code = text.charCodeAt(unit);
      let charBytes: number;
      let charUnits = 1;
      if (code < 0x80) {
        charBytes = 1;
      } else if (code < 0x800) {
        charBytes = 2;
      } else if (isHighSurrogate(code) && unit + 1 < text.length && isLowSurrogate(text.charCodeAt(unit + 1))) {
        charBytes = 4;
        charUnits = 2;
      } else {
        charBytes = 3;
      }
      if (bytes + charBytes > byteDelta) break;
      bytes += charBytes;
      unit += charUnits;
    }
    return unit - startUnit;
  }
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
