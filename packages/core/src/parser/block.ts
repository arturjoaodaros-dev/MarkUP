// Laço principal do passe de blocos. Tenta, em ordem, cada construção
// reconhecida e consome as linhas correspondentes. Contêineres (citação,
// item de lista, corpo de diretiva) recursam chamando `parseBlocks` sobre o
// subconjunto de linhas, preservando offsets originais.

import type {
  Blockquote,
  BlockNode,
  CodeBlock,
  ColumnAlign,
  Heading,
  List,
  ListItem,
  Table,
  TableCell,
  TableRow,
  ThematicBreak,
} from '../ast/nodes';
import type { Diagnostic } from '../diagnostics';
import { diagnostic } from '../diagnostics';
import { HARD_BREAK_MARKER, parseInline } from './inline';
import type { Line } from './scanner';
import { isBlank, lineStartPoint, pointAt, spanLines } from './scanner';
import { matchCodeFenceMarker, matchDirectiveClose, matchDirectiveOpen, findDirectiveBody } from './directive';
import { parseDirective } from '../directives/registry';
import { collectListItemLines, matchListLine } from './rules/list';
import { isTableDelimiterRow, parseAlignRow, splitRow } from './rules/table';

const HEADING_RE = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/;
// Combinação de 1-6 "#" seguidos imediatamente de um caractere que não é
// espaço nem "#" — sintaticamente não é um heading ATX (o CommonMark exige
// espaço após os "#", justamente para não confundir com "#hashtag" dentro
// de texto normal), mas é comum o suficiente por engano para merecer um
// aviso explicando por que a linha não virou heading, em vez de falhar
// silenciosamente.
const HEADING_MISSING_SPACE_RE = /^ {0,3}(#{1,6})[^\s#]/;
const THEMATIC_BREAK_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BLOCKQUOTE_RE = /^ {0,3}>\s?(.*)$/;

export function parseBlocks(lines: Line[], diagnostics: Diagnostic[]): BlockNode[] {
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    // Diretiva MarkUP
    const open = matchDirectiveOpen(line);
    if (open) {
      const body = findDirectiveBody(lines, i + 1, open.fenceLength);
      if (!body.closed) {
        diagnostics.push(
          diagnostic(
            'warning',
            'directive-unclosed',
            `A diretiva ":::${open.name}" nao foi fechada; fechando implicitamente no fim do documento.`,
            spanLines(line, lines[lines.length - 1] ?? line),
          ),
        );
      }
      const endLine = lines[body.closeIndex] ?? lines[lines.length - 1] ?? line;
      const pos = spanLines(line, endLine);
      const node = parseDirective(
        { name: open.name, attrsRaw: open.attrsRaw, bodyLines: body.bodyLines, position: pos, fenceLength: open.fenceLength },
        { parseBlocks: (l) => parseBlocks(l, diagnostics) },
        diagnostics,
      );
      blocks.push(node);
      i = body.closeIndex + 1;
      continue;
    }

    // Cerca de codigo
    const fence = matchCodeFenceMarker(line);
    if (fence) {
      const lang = line.text.trim().slice(fence.length).trim() || undefined;
      const contentLines: string[] = [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        const closing = matchCodeFenceMarker(lines[j]);
        if (closing && closing.char === fence.char && closing.length >= fence.length && lines[j].text.trim().length === closing.length) {
          closed = true;
          break;
        }
        contentLines.push(lines[j].text);
      }
      if (!closed) {
        diagnostics.push(
          diagnostic('warning', 'code-fence-unclosed', 'Bloco de codigo nao foi fechado.', spanLines(line, lines[lines.length - 1] ?? line)),
        );
      }
      const endLine = lines[j] ?? lines[lines.length - 1] ?? line;
      const node: CodeBlock = {
        type: 'codeBlock',
        lang,
        value: contentLines.join('\n'),
        position: spanLines(line, endLine),
      };
      blocks.push(node);
      i = closed ? j + 1 : lines.length;
      continue;
    }

    // Regua horizontal (checada antes de lista)
    if (THEMATIC_BREAK_RE.test(line.text)) {
      const node: ThematicBreak = { type: 'thematicBreak', position: spanLines(line, line) };
      blocks.push(node);
      i++;
      continue;
    }

    // Heading ATX
    const heading = HEADING_RE.exec(line.text);
    if (heading) {
      const depth = heading[1].length as Heading['depth'];
      const text = (heading[2] ?? '').replace(/\s+#+\s*$/, '');
      const node: Heading = {
        type: 'heading',
        depth,
        children: parseInline(text, pointAt(line, heading[1].length + 1)),
        position: spanLines(line, line),
      };
      blocks.push(node);
      i++;
      continue;
    }

    // Citacao em bloco
    if (BLOCKQUOTE_RE.test(line.text)) {
      const inner: Line[] = [];
      let j = i;
      for (; j < lines.length; j++) {
        const l = lines[j];
        const m = BLOCKQUOTE_RE.exec(l.text);
        if (m) {
          inner.push({ text: m[1], number: l.number, startOffset: l.startOffset + (l.text.length - m[1].length) });
        } else if (!isBlank(l) && !isBlockStart(l)) {
          inner.push(l); // continuacao preguicosa
        } else {
          break;
        }
      }
      const node: Blockquote = {
        type: 'blockquote',
        children: parseBlocks(inner, diagnostics),
        position: spanLines(line, lines[j - 1]),
      };
      blocks.push(node);
      i = j;
      continue;
    }

    // Lista
    const listInfo = matchListLine(line);
    if (listInfo) {
      const items: ListItem[] = [];
      let j = i;
      const startLine = line;
      let lastLine = line;
      while (j < lines.length) {
        const info = matchListLine(lines[j]);
        if (!info || info.ordered !== listInfo.ordered) break;
        const itemLines = collectListItemLines(lines, j, info);
        lastLine = lines[j + itemLines.length - 1] ?? lines[j];
        items.push({
          type: 'listItem',
          children: parseBlocks(itemLines, diagnostics),
          position: spanLines(lines[j], lastLine),
        });
        j += itemLines.length;
        while (j < lines.length && isBlank(lines[j])) j++;
      }
      const node: List = {
        type: 'list',
        ordered: listInfo.ordered,
        start: listInfo.start,
        items,
        position: spanLines(startLine, lastLine),
      };
      blocks.push(node);
      i = j;
      continue;
    }

    // Tabela
    if (line.text.includes('|') && i + 1 < lines.length && isTableDelimiterRow(lines[i + 1])) {
      const align = parseAlignRow(lines[i + 1]);
      const header = makeRow(splitRow(line.text), line);
      let j = i + 2;
      const rows: TableRow[] = [];
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (isBlank(l) || !l.text.includes('|')) break;
        rows.push(makeRow(splitRow(l.text), l));
      }
      const node: Table = { type: 'table', align, header, rows, position: spanLines(line, lines[j - 1]) };
      blocks.push(node);
      i = j;
      continue;
    }

    // Paragrafo: consome ate linha em branco ou inicio de outra construcao
    {
      if (HEADING_MISSING_SPACE_RE.test(line.text)) {
        const level = HEADING_MISSING_SPACE_RE.exec(line.text)![1].length;
        diagnostics.push(
          diagnostic(
            'warning',
            'heading-missing-space',
            `Linha começa com ${level} "#" mas sem espaço depois — não é reconhecida como heading. Use "${'#'.repeat(level)} título" para virar um heading de nível ${level}.`,
            spanLines(line, line),
          ),
        );
      }

      let j = i;
      const rawTextLines: string[] = [];
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (isBlank(l)) break;
        if (j > i && isBlockStart(l)) break;
        rawTextLines.push(l.text);
      }
      const text = joinParagraphLines(rawTextLines);
      const node = {
        type: 'paragraph' as const,
        children: parseInline(text, lineStartPoint(line)),
        position: spanLines(line, lines[j - 1]),
      };
      blocks.push(node);
      i = j;
    }
  }

  return blocks;
}

/**
 * Achata as linhas cruas de um parágrafo em um único texto para o passe
 * inline. Uma quebra suave (linha normal) vira um espaço; uma quebra rígida
 * (linha terminada em duas ou mais espaços, ou uma barra invertida solta)
 * vira o marcador que `parseInline` reconhece e transforma num nó `break`
 * de verdade — sem isso, todo `\n` dentro de um parágrafo era simplesmente
 * perdido.
 */
function joinParagraphLines(rawLines: string[]): string {
  const parts: string[] = [];
  for (let k = 0; k < rawLines.length; k++) {
    const raw = rawLines[k];
    const isLast = k === rawLines.length - 1;
    parts.push(raw.trim());
    if (!isLast) {
      parts.push(endsWithHardBreak(raw) ? HARD_BREAK_MARKER : ' ');
    }
  }
  return parts.join('');
}

function endsWithHardBreak(rawLine: string): boolean {
  if (/ {2,}$/.test(rawLine)) return true;
  const withoutTrailingSpaces = rawLine.replace(/[ \t]+$/, '');
  const backslashes = /\\+$/.exec(withoutTrailingSpaces);
  // Um número ímpar de barras finais significa a última é "solta" (as
  // anteriores, se houver, formam pares de escape "\\" já resolvidos no
  // passe inline) — é isso que sinaliza a quebra rígida.
  return !!backslashes && backslashes[0].length % 2 === 1;
}

function makeRow(cells: string[], line: Line): TableRow {
  const tableCells: TableCell[] = cells.map((c) => ({
    type: 'tableCell',
    children: parseInline(c, lineStartPoint(line)),
    position: spanLines(line, line),
  }));
  return { type: 'tableRow', cells: tableCells, position: spanLines(line, line) };
}

/** Linhas que interrompem um paragrafo em andamento (sem continuacao preguicosa). */
function isBlockStart(line: Line): boolean {
  if (matchDirectiveOpen(line)) return true;
  if (matchDirectiveClose(line)) return true;
  if (matchCodeFenceMarker(line)) return true;
  if (THEMATIC_BREAK_RE.test(line.text)) return true;
  if (HEADING_RE.test(line.text)) return true;
  if (BLOCKQUOTE_RE.test(line.text)) return true;
  if (matchListLine(line)) return true;
  return false;
}

// Reexportado apenas para uso interno de tipos em outros módulos do parser.
export type { ColumnAlign };
