/**
 * Converts LSP/TextMate snippet syntax (what the language service produces) to
 * CodeMirror's: `$1` → `${1}`, `${1|a,b|}` → `${1:a}`, and literal braces escaped.
 */
export function toCodeMirrorSnippet(snippet: string): string {
  let out = '';
  let i = 0;
  while (i < snippet.length) {
    const c = snippet[i]!;
    if (c === '\\' && i + 1 < snippet.length) {
      const next = snippet[i + 1]!;
      out += next === '{' || next === '}' ? `\\${next}` : next;
      i += 2;
      continue;
    }
    if (c === '$') {
      const simple = /^\$(\d+)/.exec(snippet.slice(i));
      if (simple) {
        out += `\${${simple[1]}}`;
        i += simple[0].length;
        continue;
      }
      if (snippet[i + 1] === '{') {
        const end = findClose(snippet, i + 2);
        if (end !== -1) {
          const body = snippet.slice(i + 2, end);
          const choice = /^(\d+)\|([^|]*)\|$/.exec(body);
          const placeholder = /^(\d+)(?::(.*))?$/s.exec(body);
          if (choice) out += `\${${choice[1]}:${escapeBraces(choice[2]!.split(',')[0] ?? '')}}`;
          else if (placeholder) out += placeholder[2] === undefined ? `\${${placeholder[1]}}` : `\${${placeholder[1]}:${escapeBraces(placeholder[2])}}`;
          else out += `\${${escapeBraces(body)}}`;
          i = end + 1;
          continue;
        }
      }
    }
    out += c === '{' || c === '}' ? `\\${c}` : c;
    i++;
  }
  return out;
}

function findClose(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

function escapeBraces(text: string): string {
  return text.replace(/[{}]/g, '\\$&');
}
