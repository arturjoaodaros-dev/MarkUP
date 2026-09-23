export interface FuzzyMatch {
  score: number;
  /** Indices of matched characters in the candidate, for highlighting. */
  indices: number[];
}

/**
 * Subsequence matching with bonuses for consecutive characters, word starts
 * and early matches — the usual "quick open" behaviour. Case-insensitive.
 */
export function fuzzyMatch(query: string, candidate: string): FuzzyMatch | null {
  if (query.length === 0) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  // A contiguous match always beats a scattered one.
  const at = c.indexOf(q.trim());
  if (at !== -1 && q.trim().length > 0) {
    const length = q.trim().length;
    const boundary = at === 0 || /[\s/_.\-:[\]]/.test(candidate[at - 1]!);
    return { score: 100 + (boundary ? 20 : 0) - at * 0.1 - candidate.length * 0.01, indices: Array.from({ length }, (_, i) => at + i) };
  }
  const indices: number[] = [];
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = c.indexOf(ch, from);
    if (at === -1) return null;
    const boundary = at === 0 || /[\s/_.\-:[\]]/.test(candidate[at - 1]!) || (candidate[at - 1] === candidate[at - 1]!.toLowerCase() && candidate[at] !== candidate[at]!.toLowerCase());
    score += 1;
    if (at === previous + 1) score += 3;
    if (boundary) score += 4;
    score -= Math.min(at - from, 6) * 0.2;
    indices.push(at);
    previous = at;
    from = at + 1;
  }
  score -= candidate.length * 0.01;
  if (c.startsWith(q)) score += 6;
  return { score, indices };
}

export function fuzzyFilter<T>(query: string, items: readonly T[], text: (item: T) => string, limit = 200): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, text(item));
    if (match) out.push({ item, match });
  }
  if (query) out.sort((a, b) => b.match.score - a.match.score);
  return out.slice(0, limit);
}
