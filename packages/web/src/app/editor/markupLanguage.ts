// Realce de sintaxe do MarkUP para o CodeMirror. Não é um parser completo —
// é um tokenizer por linha, suficiente para dar feedback visual imediato ao
// digitar (headings, diretivas, ênfase, código). A fonte de verdade
// estrutural é sempre `src/markup/parser`; isto aqui é só apresentação.

import { StreamLanguage } from '@codemirror/language';
import type { StringStream } from '@codemirror/language';

interface State {
  inFence: boolean;
  fenceChar: string;
  fenceLen: number;
}

function startState(): State {
  return { inFence: false, fenceChar: '', fenceLen: 0 };
}

const CODE_FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const DIRECTIVE_OPEN_RE = /^(:{3,})\s*[A-Za-z][\w-]*/;
const DIRECTIVE_CLOSE_RE = /^(:{3,})\s*$/;

export const markupStreamParser = {
  startState,
  token(stream: StringStream, state: State): string | null {
    if (stream.sol()) {
      const line = stream.string;

      const fenceMatch = CODE_FENCE_RE.exec(line);
      if (fenceMatch) {
        const char = fenceMatch[1][0];
        const len = fenceMatch[1].length;
        if (state.inFence && char === state.fenceChar && len >= state.fenceLen) {
          state.inFence = false;
        } else if (!state.inFence) {
          state.inFence = true;
          state.fenceChar = char;
          state.fenceLen = len;
        }
        stream.skipToEnd();
        return 'keyword';
      }

      if (!state.inFence) {
        if (DIRECTIVE_OPEN_RE.test(line) || DIRECTIVE_CLOSE_RE.test(line)) {
          stream.skipToEnd();
          return 'atom';
        }
        if (/^ {0,3}#{1,6}\s/.test(line)) {
          stream.skipToEnd();
          return 'header';
        }
        if (/^ {0,3}>/.test(line)) {
          stream.skipToEnd();
          return 'quote';
        }
      }
    }

    if (state.inFence) {
      stream.skipToEnd();
      return 'string';
    }

    if (stream.match(/^\*\*[^*]+\*\*/) || stream.match(/^__[^_]+__/)) return 'strong';
    if (stream.match(/^~~[^~]+~~/)) return 'strikethrough';
    if (stream.match(/^\*[^*]+\*/) || stream.match(/^_[^_]+_/)) return 'em';
    if (stream.match(/^`[^`]*`/)) return 'string';
    if (stream.match(/^!?\[[^\]]*\]\([^)]*\)/)) return 'link';

    stream.next();
    return null;
  },
};

export const markupLanguage = StreamLanguage.define(markupStreamParser);
