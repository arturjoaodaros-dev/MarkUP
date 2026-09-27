/**
 * Formatting commands behind the editor toolbar. Each one edits the source
 * with real MarkUP syntax and is careful never to produce text that parses
 * differently from what the author asked for.
 *
 * Pure functions from an EditorState to a transaction, so they are testable
 * without a DOM.
 */
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from '@codemirror/state';

export type InlineFormat = 'bold' | 'italic' | 'strikethrough' | 'underline';

interface Wrapper {
  open: string;
  close: string;
  placeholder: string;
  /** For `*` and `~` markers: is the format on, given the marker run length around the text? */
  active?: (run: number) => boolean;
}

const WRAPPERS: Record<InlineFormat, Wrapper> = {
  // `***x***` is bold and italic, so asterisk runs are counted rather than compared.
  bold: { open: '**', close: '**', placeholder: 'bold text', active: (n) => n >= 2 },
  italic: { open: '*', close: '*', placeholder: 'italic text', active: (n) => n % 2 === 1 },
  strikethrough: { open: '~~', close: '~~', placeholder: 'text', active: (n) => n >= 2 },
  // Markdown has no underline; MarkUP uses the `u` inline component.
  underline: { open: ':u[', close: ']', placeholder: 'underlined text' },
};

/** Block syntax at the start of a line that inline formatting must not swallow. */
const BLOCK_PREFIX =
  /^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/;

interface Segment {
  from: number;
  to: number;
}

/** The parts of a range to format: one per line, without block markers or surrounding spaces. */
function segments(state: EditorState, range: SelectionRange): Segment[] {
  const doc = state.doc;
  const out: Segment[] = [];
  const first = doc.lineAt(range.from).number;
  const last = doc.lineAt(range.to).number;
  for (let n = first; n <= last; n++) {
    const line = doc.line(n);
    const prefix = BLOCK_PREFIX.exec(line.text)?.[0].length ?? 0;
    let from = Math.max(range.from, line.from + prefix);
    let to = Math.min(range.to, line.to);
    while (from < to && /\s/.test(doc.sliceString(from, from + 1))) from++;
    while (to > from && /\s/.test(doc.sliceString(to - 1, to))) to--;
    if (from < to) out.push({ from, to });
  }
  return out;
}

function runLength(text: string, char: string, fromEnd: boolean): number {
  let n = 0;
  if (fromEnd) while (n < text.length && text[text.length - 1 - n] === char) n++;
  else while (n < text.length && text[n] === char) n++;
  return n;
}

type Wrapping = 'outside' | 'inside' | null;

/** Whether `seg` is already formatted, with the markers around it or selected with it. */
function wrapping(state: EditorState, seg: Segment, w: Wrapper): Wrapping {
  const doc = state.doc;
  if (w.active) {
    const char = w.open[0]!;
    const before = doc.sliceString(Math.max(0, seg.from - 3), seg.from);
    const after = doc.sliceString(seg.to, seg.to + 3);
    const outside = Math.min(runLength(before, char, true), runLength(after, char, false));
    if (outside > 0 && w.active(outside)) return 'outside';
    const text = doc.sliceString(seg.from, seg.to);
    const inside = Math.min(runLength(text, char, false), runLength(text, char, true));
    if (text.length > 2 * inside && inside > 0 && w.active(inside)) return 'inside';
    return null;
  }
  const before = doc.sliceString(Math.max(0, seg.from - w.open.length), seg.from);
  const after = doc.sliceString(seg.to, seg.to + w.close.length);
  if (before === w.open && after === w.close) return 'outside';
  const text = doc.sliceString(seg.from, seg.to);
  if (
    text.length > w.open.length + w.close.length &&
    text.startsWith(w.open) &&
    text.endsWith(w.close)
  )
    return 'inside';
  return null;
}

/**
 * An inline directive only starts where its colon does not follow a letter,
 * digit or colon (`word:u[x]` is plain text), so underline starts at a word boundary.
 */
function directiveStart(state: EditorState, from: number): number {
  const prev = from > 0 ? state.doc.sliceString(from - 1, from) : '';
  if (!/[\p{L}\p{N}_:]/u.test(prev)) return from;
  return state.wordAt(from - 1)?.from ?? from;
}

/** Brackets in a label must be balanced; escape them all when they are not. */
function bracketEscapes(state: EditorState, seg: Segment): ChangeSpec[] {
  const text = state.doc.sliceString(seg.from, seg.to);
  let depth = 0;
  let balanced = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '[') depth++;
    else if (c === ']' && --depth < 0) balanced = false;
  }
  if (balanced && depth === 0) return [];
  const edits: ChangeSpec[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '[' || text[i] === ']') edits.push({ from: seg.from + i, insert: '\\' });
  }
  return edits;
}

function wrapChanges(state: EditorState, seg: Segment, w: Wrapper, format: InlineFormat) {
  const from = format === 'underline' ? directiveStart(state, seg.from) : seg.from;
  const escapes = format === 'underline' ? bracketEscapes(state, seg) : [];
  return [{ from, insert: w.open }, ...escapes, { from: seg.to, insert: w.close }];
}

function unwrapChanges(seg: Segment, w: Wrapper, how: 'outside' | 'inside'): ChangeSpec[] {
  const open = w.open.length;
  const close = w.close.length;
  return how === 'outside'
    ? [
        { from: seg.from - open, to: seg.from },
        { from: seg.to, to: seg.to + close },
      ]
    : [
        { from: seg.from, to: seg.from + open },
        { from: seg.to - close, to: seg.to },
      ];
}

/**
 * Toggles an inline format on every selection range:
 * - a selection is wrapped line by line, skipping list, quote and heading markers;
 * - formatted text (markers around or included in the selection) is unwrapped;
 * - a bare cursor formats the word it is in, or inserts a selected placeholder.
 */
export function toggleInline(state: EditorState, format: InlineFormat): TransactionSpec {
  const w = WRAPPERS[format];
  return state.changeByRange((range) => {
    if (range.empty) {
      const word = state.wordAt(range.head);
      if (word && word.from < word.to) {
        return toggleSegments(
          state,
          EditorSelection.range(word.from, word.to),
          [word],
          w,
          format,
          range,
        );
      }
      // `**|**` — an empty pair: remove it.
      const pos = range.head;
      const around = { from: pos, to: pos };
      if (wrapping(state, around, { ...w, active: undefined }) === 'outside') {
        const changes = unwrapChanges(around, w, 'outside');
        return { changes, range: EditorSelection.cursor(pos - w.open.length) };
      }
      const insert = w.open + w.placeholder + w.close;
      const prev = state.doc.sliceString(Math.max(0, pos - 1), pos);
      const start = format === 'underline' && /[\p{L}\p{N}_:]/u.test(prev) ? ' ' : '';
      const at = pos + start.length + w.open.length;
      return {
        changes: { from: pos, insert: start + insert },
        range: EditorSelection.range(at, at + w.placeholder.length),
      };
    }
    return toggleSegments(state, range, segments(state, range), w, format, range);
  });
}

function toggleSegments(
  state: EditorState,
  target: SelectionRange,
  segs: Segment[],
  w: Wrapper,
  format: InlineFormat,
  original: SelectionRange,
) {
  if (segs.length === 0) return { range: original };
  const states = segs.map((s) => wrapping(state, s, w));
  const allOn = states.every((s) => s !== null);
  const changes: ChangeSpec[] = [];
  segs.forEach((seg, i) => {
    const how = states[i]!;
    if (allOn) changes.push(...unwrapChanges(seg, w, how as 'outside' | 'inside'));
    else if (how === null) changes.push(...wrapChanges(state, seg, w, format));
  });
  const set = state.changes(changes);
  // Keep the formatted text selected (inside the markers). A bare cursor stays where it was.
  if (original.empty)
    return { changes: set, range: EditorSelection.cursor(set.mapPos(original.head, 1)) };
  const from = Math.min(target.from, segs[0]!.from);
  const to = Math.max(target.to, segs[segs.length - 1]!.to);
  const a = set.mapPos(segs[0]!.from, allOn ? -1 : 1);
  const b = set.mapPos(segs[segs.length - 1]!.to, allOn ? 1 : -1);
  return {
    changes: set,
    range:
      segs.length === 1 && from === segs[0]!.from && to === segs[0]!.to
        ? EditorSelection.range(a, b)
        : EditorSelection.range(set.mapPos(from, -1), set.mapPos(to, 1)),
  };
}

// ---------------------------------------------------------------------------
// Line formats

export type LineFormat = 'task' | 'bullet';

/** quote prefix, indentation, list marker (+ spaces), task box (+ spaces). */
const LIST_LINE =
  /^((?:[ \t]*>[ \t]?)*)([ \t]*)(?:([-*+]|\d{1,9}[.)])([ \t]+|$)(\[[ xX]\](?:[ \t]+|$))?)?/;

interface ListLine {
  from: number;
  /** Offset where content (after quote and indentation) starts. */
  contentFrom: number;
  marker: string | undefined;
  /** The marker ends the line, with no space after it. */
  bareMarker: boolean;
  /** Offset just after the marker and its spaces. */
  afterMarker: number;
  task: string | undefined;
  blank: boolean;
}

function listLines(state: EditorState, range: SelectionRange): ListLine[] {
  const doc = state.doc;
  const first = doc.lineAt(range.from).number;
  const last = doc.lineAt(range.to).number;
  const out: ListLine[] = [];
  for (let n = first; n <= last; n++) {
    const line = doc.line(n);
    // A selection ending at the start of a line does not include that line.
    if (n > first && n === last && range.to === line.from) break;
    const m = LIST_LINE.exec(line.text)!;
    const contentFrom = line.from + m[1]!.length + m[2]!.length;
    out.push({
      from: line.from,
      contentFrom,
      marker: m[3],
      bareMarker: m[3] !== undefined && m[4] === '',
      afterMarker: contentFrom + (m[3]?.length ?? 0) + (m[4]?.length ?? 0),
      task: m[5],
      blank: line.text.trim() === '',
    });
  }
  // Blank lines inside a multi-line selection are left alone.
  return out.length > 1 ? out.filter((l) => !l.blank) : out;
}

/**
 * Toggles task items (`- [ ] `) or bullet items (`- `) on every selected line.
 * When all lines already have the format it is removed; otherwise it is added
 * where missing (a bullet item becomes a task item, a plain line a list item).
 */
export function toggleLines(state: EditorState, format: LineFormat): TransactionSpec {
  return state.changeByRange((range) => {
    const lines = listLines(state, range);
    const has = (l: ListLine) =>
      format === 'task' ? l.task !== undefined : l.marker !== undefined && !/\d/.test(l.marker);
    const allOn = lines.length > 0 && lines.every(has);
    const changes: ChangeSpec[] = [];
    for (const l of lines) {
      if (allOn) {
        if (format === 'task')
          changes.push({ from: l.afterMarker, to: l.afterMarker + l.task!.length });
        else changes.push({ from: l.contentFrom, to: l.afterMarker + (l.task?.length ?? 0) });
        continue;
      }
      if (has(l)) continue;
      if (format === 'task') {
        if (l.marker !== undefined)
          changes.push({
            from: l.afterMarker,
            insert: (l.bareMarker ? ' ' : '') + '[ ] ',
          });
        else changes.push({ from: l.contentFrom, insert: '- [ ] ' });
      } else if (l.marker !== undefined) {
        // An ordered item becomes a bullet item.
        changes.push({ from: l.contentFrom, to: l.contentFrom + l.marker.length, insert: '-' });
      } else changes.push({ from: l.contentFrom, insert: '- ' });
    }
    const set = state.changes(changes);
    if (range.empty)
      return { changes: set, range: EditorSelection.cursor(set.mapPos(range.head, 1)) };
    // A selection keeps covering whole lines, including the markers added at their start.
    const from = set.mapPos(range.from, -1);
    const to = set.mapPos(range.to, 1);
    return {
      changes: set,
      range:
        range.anchor <= range.head
          ? EditorSelection.range(from, to)
          : EditorSelection.range(to, from),
    };
  });
}

// ---------------------------------------------------------------------------
// Links

/** Wraps the selection in a link. A selected URL becomes the destination. */
export function insertLink(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    if (/^(?:https?:\/\/|mailto:|www\.)\S+$/.test(text)) {
      const insert = `[link text](${text})`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(range.from + 1, range.from + 10),
      };
    }
    const label = text.length > 0 && !text.includes('\n') ? text : 'link text';
    const insert = `[${label}](url)`;
    const url = range.from + label.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(url, url + 3),
    };
  });
}

// ---------------------------------------------------------------------------
// Blocks

/**
 * Where a block component goes: at the cursor when it is on an empty line,
 * otherwise on a new line after the selection. Returns the text around the
 * insertion so the block always sits on lines of its own, between blank lines.
 */
export function blockInsertion(state: EditorState): { at: number; before: string; after: string } {
  const { main } = state.selection;
  const doc = state.doc;
  const line = doc.lineAt(main.to);
  const hasText = (n: number) => n >= 1 && n <= doc.lines && doc.line(n).text.trim() !== '';
  const after = hasText(line.number + 1) ? '\n' : '';
  if (main.empty && line.text.trim() === '')
    return { at: line.from, before: hasText(line.number - 1) ? '\n' : '', after };
  return { at: line.to, before: '\n\n', after };
}

export const PIE_CHART_SNIPPET =
  ':::chart{type=pie}\ntitle: ${1:Title}\ndata:\n  ${2:First}: ${3:50}\n  ${4:Second}: ${5:30}\n  ${6:Third}: ${7:20}\n:::';
