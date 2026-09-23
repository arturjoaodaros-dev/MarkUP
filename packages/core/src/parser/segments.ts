/**
 * Inline content is gathered by the block parser line by line, after container
 * prefixes (`> `, list indentation…) have been stripped. A {@link SegmentText}
 * joins those pieces with `\n` and remembers where each piece came from, so the
 * inline parser can report exact source positions.
 */

export interface Segment {
  text: string;
  /** Source offset of `text[0]`. */
  offset: number;
}

export class SegmentText {
  readonly text: string;
  private readonly starts: number[] = [];
  private readonly offsets: number[] = [];
  private readonly lengths: number[] = [];

  constructor(segments: readonly Segment[]) {
    let text = '';
    segments.forEach((segment, i) => {
      if (i > 0) text += '\n';
      this.starts.push(text.length);
      this.offsets.push(segment.offset);
      this.lengths.push(segment.text.length);
      text += segment.text;
    });
    if (segments.length === 0) {
      this.starts.push(0);
      this.offsets.push(0);
      this.lengths.push(0);
    }
    this.text = text;
  }

  /** Source offset for an index into {@link text}. Indices on a joining `\n` map to the end of the line. */
  toOffset(i: number): number {
    const starts = this.starts;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= i) lo = mid;
      else hi = mid - 1;
    }
    const within = Math.min(Math.max(0, i - starts[lo]!), this.lengths[lo]!);
    return this.offsets[lo]! + within;
  }

  /** Source offset of the end of the text. */
  endOffset(): number {
    return this.toOffset(this.text.length);
  }
}
