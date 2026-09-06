import type { Line } from '../scanner';
import { isBlank } from '../scanner';

const UNORDERED_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;

export interface ListLineInfo {
  ordered: boolean;
  start?: number;
  indent: number; // número de colunas consumidas pelo marcador
  content: string;
}

export function matchListLine(line: Line): ListLineInfo | null {
  const u = UNORDERED_RE.exec(line.text);
  if (u) {
    const markerEnd = line.text.length - u[2].length;
    return { ordered: false, indent: markerEnd, content: u[2] };
  }
  const o = ORDERED_RE.exec(line.text);
  if (o) {
    const markerEnd = line.text.length - o[3].length;
    return { ordered: true, start: Number(o[2]), indent: markerEnd, content: o[3] };
  }
  return null;
}

/**
 * Agrupa as linhas de um único item de lista: a linha marcadora (com o
 * marcador removido) mais quaisquer linhas de continuação indentadas ao
 * nível do conteúdo do item. Os offsets são ajustados para que a posição
 * relatada dentro do item continue apontando para o caractere certo no
 * documento original.
 */
export function collectListItemLines(lines: Line[], startIndex: number, info: ListLineInfo): Line[] {
  const first = lines[startIndex];
  const item: Line[] = [
    { text: info.content, number: first.number, startOffset: first.startOffset + info.indent },
  ];
  let i = startIndex + 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank(line)) break;
    if (matchListLine(line)) break;
    if (line.text.startsWith(' '.repeat(info.indent))) {
      item.push({ text: line.text.slice(info.indent), number: line.number, startOffset: line.startOffset + info.indent });
    } else {
      break;
    }
  }
  return item;
}
