import {
  childrenOf,
  LineIndex,
  parse,
  visit,
  type Node,
  type ParseResult,
  type Range,
} from '@markup-lang/core';

/**
 * Structural invariants every parse result must satisfy, for any input:
 *
 * - every range lies within the source and has start ≤ end;
 * - line/column agree with the offset;
 * - children lie within their parent and siblings do not go backwards;
 * - diagnostics have valid ranges and non-empty messages.
 *
 * Returns a list of violations (empty when everything holds).
 */
export function checkInvariants(source: string, result: ParseResult = parse(source)): string[] {
  const problems: string[] = [];
  const index = new LineIndex(source);
  const checkRange = (range: Range, what: string) => {
    const { start, end } = range;
    if (!(start.offset >= 0 && start.offset <= end.offset && end.offset <= source.length)) {
      problems.push(
        `${what}: bad offsets ${start.offset}..${end.offset} (length ${source.length})`,
      );
      return;
    }
    for (const point of [start, end]) {
      const expected = index.pointAt(point.offset);
      if (expected.line !== point.line || expected.column !== point.column) {
        problems.push(
          `${what}: point ${point.line}:${point.column} does not match offset ${point.offset} (${expected.line}:${expected.column})`,
        );
      }
    }
  };

  visit(result.document, (node, ancestors) => {
    const what = `${node.type}@${node.position.start.offset}`;
    checkRange(node.position, what);
    const parent = ancestors[ancestors.length - 1];
    if (parent && parent.type !== 'document') {
      if (
        node.position.start.offset < parent.position.start.offset ||
        node.position.end.offset > parent.position.end.offset
      ) {
        problems.push(
          `${what} is outside its parent ${parent.type} ${parent.position.start.offset}..${parent.position.end.offset}`,
        );
      }
    }
    const kids = childrenOf(node) as Node[];
    for (let i = 1; i < kids.length; i++) {
      if (kids[i]!.position.start.offset < kids[i - 1]!.position.start.offset) {
        problems.push(`${what}: children out of order at ${i}`);
      }
    }
    if ('nameRange' in node && node.nameRange) checkRange(node.nameRange, `${what}.nameRange`);
    if ('attributes' in node && node.attributes) {
      checkRange(node.attributes.range, `${what}.attributes`);
      for (const item of node.attributes.items) checkRange(item.range, `${what}.attribute`);
    }
  });
  if (result.document.frontMatter) checkRange(result.document.frontMatter.position, 'frontMatter');

  for (const d of result.diagnostics) {
    checkRange(d.range, `diagnostic ${d.code}`);
    if (!d.message) problems.push(`diagnostic ${d.code} has no message`);
    for (const r of d.related ?? []) checkRange(r.range, `diagnostic ${d.code} related`);
    for (const fix of d.fixes ?? [])
      for (const edit of fix.edits) checkRange(edit.range, `diagnostic ${d.code} fix`);
  }
  return problems;
}

/** A tree without positions, for comparing parses of equivalent inputs. */
export function shape(result: ParseResult): unknown {
  return JSON.parse(
    JSON.stringify(result.document, (key, value: unknown) =>
      key === 'position' || key === 'range' || key.endsWith('Range') ? undefined : value,
    ),
  );
}
