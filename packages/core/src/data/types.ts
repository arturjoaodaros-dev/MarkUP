import type { Range } from '../source/position.ts';

/**
 * MarkUP Data — a strict, positioned subset of YAML used for front matter and
 * for the bodies of `data` directives such as `chart`.
 */
export type DataNode = DataMap | DataSeq | DataScalar;

export interface DataMapEntry {
  key: string;
  keyRange: Range;
  value: DataNode;
  /** Range of the whole entry (key through end of value). */
  range: Range;
}

export interface DataMap {
  kind: 'map';
  entries: DataMapEntry[];
  range: Range;
}

export interface DataSeq {
  kind: 'seq';
  items: DataNode[];
  /** Written as `[a, b]` rather than `- a` lines. */
  flow: boolean;
  range: Range;
}

export type ScalarStyle = 'plain' | 'double' | 'single' | 'literal';

export interface DataScalar {
  kind: 'scalar';
  value: string | number | boolean | null;
  style: ScalarStyle;
  range: Range;
}

export type PlainData = string | number | boolean | null | PlainData[] | { [key: string]: PlainData };

/** Converts a positioned data tree to plain JavaScript values. */
export function toPlainData(node: DataNode | null): PlainData {
  if (node === null) return null;
  switch (node.kind) {
    case 'scalar':
      return node.value;
    case 'seq':
      return node.items.map(toPlainData);
    case 'map': {
      const out: { [key: string]: PlainData } = Object.create(null) as { [key: string]: PlainData };
      for (const entry of node.entries) out[entry.key] = toPlainData(entry.value);
      return out;
    }
  }
}

export function getEntry(node: DataNode | null, key: string): DataMapEntry | undefined {
  if (node?.kind !== 'map') return undefined;
  return node.entries.find((entry) => entry.key === key);
}
