// Detecção de contexto do cursor para completion — funções puras sobre
// texto de linha + coluna, sem import de `vscode`. Reaproveita as mesmas
// expressões regulares do núcleo (`matchDirectiveOpen`-equivalente) em vez
// de reinventar o reconhecimento de diretiva aqui.

const OPEN_PREFIX_RE = /^(\s*)(:{3,})\s*([A-Za-z][\w-]*)\s*/;

/** Verdadeiro quando o texto antes do cursor termina em `:::` (ou mais), possivelmente com um nome parcial — hora de sugerir nomes de diretiva. */
export function isDirectiveNamePosition(linePrefix: string): boolean {
  return /^\s*:{3,}[A-Za-z]*$/.test(linePrefix);
}

export interface AttributePosition {
  directiveName: string;
  /** Definido quando o cursor está dentro de um valor entre aspas ainda não fechado: `type="ba|`. */
  insideValueOf?: string;
}

/**
 * Detecta se o cursor está na região de atributos de uma linha de abertura
 * de diretiva (`:::nome attr="valor" |`), e se está especificamente dentro
 * do valor de um atributo (`attr="|`).
 */
export function detectAttributePosition(lineText: string, cursorColumn: number): AttributePosition | null {
  const m = OPEN_PREFIX_RE.exec(lineText);
  if (!m) return null;
  const afterName = m[0].length;
  if (cursorColumn < afterName) return null;

  const directiveName = m[3];
  const between = lineText.slice(afterName, cursorColumn);
  const valueMatch = /([A-Za-z_][\w-]*)=(?:"[^"]*|'[^']*)$/.exec(between);
  if (valueMatch) {
    return { directiveName, insideValueOf: valueMatch[1] };
  }
  return { directiveName };
}
