// Gramática de "bloco de dados": linhas no formato `Rótulo: valor`, usada
// pelo corpo de :::chart e pela seção de métricas de :::card.
//
//   Q1: 120
//   CPU: 78%

import type { Line } from './scanner';
import { isBlank } from './scanner';

export interface DataEntry {
  label: string;
  rawValue: string;
  line: Line;
}

const ENTRY_RE = /^\s*([^:]+):\s*(.+?)\s*$/;

/**
 * Consome do início de `lines` enquanto as linhas casarem com `Rótulo: valor`.
 * Para na primeira linha em branco ou que não case com o padrão, e devolve
 * as entradas reconhecidas mais o índice da primeira linha não consumida.
 */
export function parseDataBlockPrefix(lines: Line[]): { entries: DataEntry[]; consumed: number } {
  const entries: DataEntry[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank(line)) break;
    const match = ENTRY_RE.exec(line.text);
    if (!match) break;
    entries.push({ label: match[1].trim(), rawValue: match[2].trim(), line });
  }
  return { entries, consumed: i };
}

export function parseNumericValue(raw: string): number | undefined {
  const cleaned = raw.replace(/%$/, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}
