import type { SourceLocation } from "../core/types.js";

/**
 * Maps SWC byte spans to 1-indexed line and column numbers.
 */
export class SourceMapLocator {
  private readonly lineStarts: number[] = [0];

  constructor(
    readonly file: string,
    readonly source: string
  ) {
    for (let i = 0; i < source.length; i++) {
      if (source.charCodeAt(i) === 10) {
        // '\n'
        this.lineStarts.push(i + 1);
      }
    }
  }

  /**
   * Converts a 1-indexed byte offset into a SourceLocation.
   */
  getLocation(byteOffset: number): SourceLocation {
    const zeroIndex = Math.max(0, byteOffset - 1);

    // Binary search to find line index
    let low = 0;
    let high = this.lineStarts.length - 1;
    let lineIdx = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this.lineStarts[mid] <= zeroIndex) {
        lineIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const lineStart = this.lineStarts[lineIdx];
    const column = zeroIndex - lineStart + 1;

    return {
      file: this.file,
      line: lineIdx + 1,
      column,
    };
  }
}
