// Reconhecimento sintático de diretivas: `:::nome attrs...` ... `:::`.
//
// A regra de fechamento espelha a de cercas de código do CommonMark: o
// delimitador de fechamento precisa ter ao menos o mesmo comprimento do de
// abertura. Isso é o que permite aninhar diretivas usando uma cerca mais
// longa por fora (`::::tabs` contendo `:::alert`).

import type { Line } from './scanner';

export interface DirectiveOpen {
  fenceLength: number;
  name: string;
  attrsRaw: string;
}

const OPEN_RE = /^(:{3,})\s*([A-Za-z][\w-]*)\s*(.*)$/;
const CLOSE_RE = /^(:{3,})\s*$/;

export function matchDirectiveOpen(line: Line): DirectiveOpen | null {
  const m = OPEN_RE.exec(line.text);
  if (!m) return null;
  return { fenceLength: m[1].length, name: m[2], attrsRaw: m[3] };
}

export function matchDirectiveClose(line: Line): number | null {
  const m = CLOSE_RE.exec(line.text);
  return m ? m[1].length : null;
}

const CODE_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export function matchCodeFenceMarker(line: Line): { char: string; length: number } | null {
  const m = CODE_FENCE_RE.exec(line.text);
  if (!m) return null;
  return { char: m[1][0], length: m[1].length };
}

export interface DirectiveBody {
  bodyLines: Line[];
  /** Índice (em `lines`) da linha de fechamento, ou `lines.length` se implícito. */
  closeIndex: number;
  /** Falso quando o documento acabou antes de um fechamento correspondente. */
  closed: boolean;
}

/**
 * A partir da linha logo após uma abertura de comprimento `fenceLength`,
 * localiza o fechamento correspondente, ignorando marcadores dentro de
 * blocos de código e contando aninhamento de outras diretivas por meio de
 * uma pilha de comprimentos de cerca.
 */
export function findDirectiveBody(lines: Line[], startIndex: number, fenceLength: number): DirectiveBody {
  const stack: number[] = [fenceLength];
  let codeFence: { char: string; length: number } | null = null;

  let j = startIndex;
  for (; j < lines.length; j++) {
    const line = lines[j];

    if (codeFence) {
      const marker = matchCodeFenceMarker(line);
      if (marker && marker.char === codeFence.char && marker.length >= codeFence.length) {
        codeFence = null;
      }
      continue;
    }

    const maybeCodeFence = matchCodeFenceMarker(line);
    if (maybeCodeFence) {
      codeFence = maybeCodeFence;
      continue;
    }

    const open = matchDirectiveOpen(line);
    if (open) {
      stack.push(open.fenceLength);
      continue;
    }

    const closeLength = matchDirectiveClose(line);
    if (closeLength !== null && closeLength >= stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) {
        return { bodyLines: lines.slice(startIndex, j), closeIndex: j, closed: true };
      }
    }
  }

  return { bodyLines: lines.slice(startIndex), closeIndex: lines.length, closed: false };
}
