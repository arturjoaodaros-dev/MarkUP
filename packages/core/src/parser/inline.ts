// Passe inline: roda sobre o texto acumulado de um bloco (parágrafo, heading,
// célula de tabela, item de lista) e produz `InlineNode[]`.
//
// Precedência deliberadamente restrita para evitar a ambiguidade clássica de
// ênfase do Markdown: sem `_` no meio de palavra, sem aninhamento arbitrário
// de três níveis. Ordem: quebra rígida > escape > código > imagem > link >
// ênfase/negrito/rasurado > texto.

import type { InlineNode, Point, Position } from '../ast/nodes';

interface InlineContext {
  text: string;
  basePoint: Point; // ponto de origem do offset 0 deste texto, para posições absolutas
}

export function parseInline(text: string, basePoint: Point): InlineNode[] {
  const ctx: InlineContext = { text, basePoint };
  return parseRun(ctx, 0, text.length);
}

function posFor(ctx: InlineContext, start: number, end: number): Position {
  return {
    start: advance(ctx.basePoint, start),
    end: advance(ctx.basePoint, end),
  };
}

function advance(base: Point, delta: number): Point {
  // O texto inline nunca cruza linhas neste parser (parágrafos multi-linha
  // são achatados antes do passe inline), então avançar a coluna e o offset
  // é suficiente.
  return { line: base.line, column: base.column + delta, offset: base.offset + delta };
}

// Pontuação ASCII escapável — o mesmo conjunto do CommonMark (spec §2.4),
// não só os caracteres que o MarkUP usa como sintaxe, para que
// `\qualquer-pontuação` sempre produza o caractere literal e nunca vire
// sintaxe por acidente.
const ESCAPABLE = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''));

// Marcador sintético de quebra de linha rígida. `block.ts` o insere no lugar
// de duas ou mais espaços (ou uma barra invertida solta) no fim de uma
// linha, ao achatar as linhas de um parágrafo em um único texto para este
// passe. É um caractere de controle (NUL) que nunca aparece em texto
// digitado de verdade, então não há ambiguidade com o espaço comum usado
// entre linhas de uma quebra suave.
export const HARD_BREAK_MARKER = String.fromCharCode(0);

function parseRun(ctx: InlineContext, from: number, to: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = from;
  let textStart = from;

  const flushText = (end: number) => {
    if (end > textStart) {
      nodes.push({ type: 'text', value: ctx.text.slice(textStart, end), position: posFor(ctx, textStart, end) });
    }
  };

  while (i < to) {
    const ch = ctx.text[i];

    if (ch === HARD_BREAK_MARKER) {
      flushText(i);
      nodes.push({ type: 'break', position: posFor(ctx, i, i + 1) });
      i += 1;
      textStart = i;
      continue;
    }

    if (ch === '\\' && i + 1 < to && ESCAPABLE.has(ctx.text[i + 1])) {
      flushText(i);
      nodes.push({ type: 'text', value: ctx.text[i + 1], position: posFor(ctx, i, i + 2) });
      i += 2;
      textStart = i;
      continue;
    }

    if (ch === '`') {
      const close = ctx.text.indexOf('`', i + 1);
      if (close !== -1) {
        flushText(i);
        const value = ctx.text.slice(i + 1, close);
        nodes.push({ type: 'inlineCode', value, position: posFor(ctx, i, close + 1) });
        i = close + 1;
        textStart = i;
        continue;
      }
    }

    if (ch === '!' && ctx.text[i + 1] === '[') {
      const parsed = parseLinkOrImage(ctx, i + 1, to, true);
      if (parsed) {
        flushText(i);
        nodes.push(parsed.node);
        i = parsed.end;
        textStart = i;
        continue;
      }
    }

    if (ch === '[') {
      const parsed = parseLinkOrImage(ctx, i, to, false);
      if (parsed) {
        flushText(i);
        nodes.push(parsed.node);
        i = parsed.end;
        textStart = i;
        continue;
      }
    }

    if (ch === '~' && ctx.text[i + 1] === '~') {
      const st = parseWrapped(ctx, i, to, '~~', 'strikethrough');
      if (st) {
        flushText(i);
        nodes.push(st.node);
        i = st.end;
        textStart = i;
        continue;
      }
    }

    if (ch === '*' || ch === '_') {
      const em = parseEmphasis(ctx, i, to, ch);
      if (em) {
        flushText(i);
        nodes.push(em.node);
        i = em.end;
        textStart = i;
        continue;
      }
    }

    i++;
  }

  flushText(to);
  return nodes;
}

function parseEmphasis(
  ctx: InlineContext,
  start: number,
  to: number,
  marker: string,
): { node: InlineNode; end: number } | null {
  const double = ctx.text[start + 1] === marker;
  const runLength = double ? 2 : 1;
  const contentStart = start + runLength;

  // Sem ênfase no meio de palavra: precisa haver um caractere não-espaço
  // logo após o marcador de abertura.
  if (contentStart >= to || /\s/.test(ctx.text[contentStart])) return null;

  const closer = double ? marker + marker : marker;
  let searchFrom = contentStart + 1;
  while (searchFrom <= to - runLength) {
    const idx = ctx.text.indexOf(closer, searchFrom);
    if (idx === -1 || idx >= to) return null;
    const before = ctx.text[idx - 1];
    if (!/\s/.test(before)) {
      const content = ctx.text.slice(contentStart, idx);
      const children = parseRun({ text: content, basePoint: advance(ctx.basePoint, contentStart) }, 0, content.length);
      const end = idx + runLength;
      const node: InlineNode = double
        ? { type: 'strong', children, position: posFor(ctx, start, end) }
        : { type: 'emphasis', children, position: posFor(ctx, start, end) };
      return { node, end };
    }
    searchFrom = idx + closer.length;
  }
  return null;
}

/** Sintaxe de dois caracteres, abre/fecha iguais, um único nível (usado por `~~rasurado~~`). */
function parseWrapped(
  ctx: InlineContext,
  start: number,
  to: number,
  marker: string,
  type: 'strikethrough',
): { node: InlineNode; end: number } | null {
  const contentStart = start + marker.length;
  if (contentStart >= to || /\s/.test(ctx.text[contentStart])) return null;

  let searchFrom = contentStart + 1;
  while (searchFrom <= to - marker.length) {
    const idx = ctx.text.indexOf(marker, searchFrom);
    if (idx === -1 || idx >= to) return null;
    const before = ctx.text[idx - 1];
    if (!/\s/.test(before)) {
      const content = ctx.text.slice(contentStart, idx);
      const children = parseRun({ text: content, basePoint: advance(ctx.basePoint, contentStart) }, 0, content.length);
      const end = idx + marker.length;
      return { node: { type, children, position: posFor(ctx, start, end) }, end };
    }
    searchFrom = idx + marker.length;
  }
  return null;
}

function parseLinkOrImage(
  ctx: InlineContext,
  bracketStart: number,
  to: number,
  isImage: boolean,
): { node: InlineNode; end: number } | null {
  // bracketStart aponta para '['
  const closeBracket = findMatching(ctx.text, bracketStart, to, '[', ']');
  if (closeBracket === -1) return null;
  if (ctx.text[closeBracket + 1] !== '(') return null;
  const closeParen = ctx.text.indexOf(')', closeBracket + 2);
  if (closeParen === -1) return null;

  const label = ctx.text.slice(bracketStart + 1, closeBracket);
  const inside = ctx.text.slice(closeBracket + 2, closeParen).trim();
  const titleMatch = /^(\S+)(?:\s+"([^"]*)")?$/.exec(inside);
  const url = titleMatch ? titleMatch[1] : inside;
  const title = titleMatch?.[2];

  const start = isImage ? bracketStart - 1 : bracketStart;
  const end = closeParen + 1;

  if (isImage) {
    return {
      node: { type: 'image', url, alt: label, title, position: posFor(ctx, start, end) },
      end,
    };
  }

  const children = parseRun(
    { text: label, basePoint: advance(ctx.basePoint, bracketStart + 1) },
    0,
    label.length,
  );
  return {
    node: { type: 'link', url, title, children, position: posFor(ctx, start, end) },
    end,
  };
}

function findMatching(text: string, openIdx: number, to: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < to; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
