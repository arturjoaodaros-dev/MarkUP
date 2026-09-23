/**
 * Character references.
 *
 * MarkUP decodes numeric references (`&#233;`, `&#xE9;`) and a curated set of
 * named references. Because MarkUP has no raw HTML, the full HTML5 table (over two
 * thousand names) would be dead weight; unknown names are left as literal text.
 */

const cp = (code: number): string => String.fromCharCode(code);

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: cp(0xa0),
  shy: cp(0xad),
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  minus: '−',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  lsaquo: '‹',
  rsaquo: '›',
  bull: '•',
  middot: '·',
  prime: '′',
  Prime: '″',
  dagger: '†',
  Dagger: '‡',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  micro: 'µ',
  para: '¶',
  sect: '§',
  permil: '‰',
  cent: '¢',
  pound: '£',
  euro: '€',
  yen: '¥',
  curren: '¤',
  iexcl: '¡',
  iquest: '¿',
  ordf: 'ª',
  ordm: 'º',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  lArr: '⇐',
  rArr: '⇒',
  hArr: '⇔',
  crarr: '↵',
  le: '≤',
  ge: '≥',
  ne: '≠',
  asymp: '≈',
  equiv: '≡',
  infin: '∞',
  sum: '∑',
  prod: '∏',
  radic: '√',
  part: '∂',
  int: '∫',
  nabla: '∇',
  isin: '∈',
  notin: '∉',
  cap: '∩',
  cup: '∪',
  sub: '⊂',
  sup: '⊃',
  and: '∧',
  or: '∨',
  not: '¬',
  forall: '∀',
  exist: '∃',
  empty: '∅',
  there4: '∴',
  loz: '◊',
  check: '✓',
  cross: '✗',
  star: '☆',
  starf: '★',
  hearts: '♥',
  spades: '♠',
  clubs: '♣',
  diams: '♦',
  thinsp: cp(0x2009),
  ensp: cp(0x2002),
  emsp: cp(0x2003),
  zwnj: cp(0x200c),
  zwj: cp(0x200d),
  lrm: cp(0x200e),
  rlm: cp(0x200f),
  Alpha: 'Α',
  Beta: 'Β',
  Gamma: 'Γ',
  Delta: 'Δ',
  Epsilon: 'Ε',
  Zeta: 'Ζ',
  Eta: 'Η',
  Theta: 'Θ',
  Iota: 'Ι',
  Kappa: 'Κ',
  Lambda: 'Λ',
  Mu: 'Μ',
  Nu: 'Ν',
  Xi: 'Ξ',
  Omicron: 'Ο',
  Pi: 'Π',
  Rho: 'Ρ',
  Sigma: 'Σ',
  Tau: 'Τ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Chi: 'Χ',
  Psi: 'Ψ',
  Omega: 'Ω',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  rho: 'ρ',
  sigmaf: 'ς',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Agrave: 'À',
  Aacute: 'Á',
  Acirc: 'Â',
  Atilde: 'Ã',
  Auml: 'Ä',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Egrave: 'È',
  Eacute: 'É',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Igrave: 'Ì',
  Iacute: 'Í',
  Icirc: 'Î',
  Iuml: 'Ï',
  Ntilde: 'Ñ',
  Ograve: 'Ò',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  Oslash: 'Ø',
  Ugrave: 'Ù',
  Uacute: 'Ú',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
  szlig: 'ß',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
};

export interface EntityMatch {
  value: string;
  /** Length of the matched reference, including `&` and `;`. */
  length: number;
}

const NAMED_RE = /^&([A-Za-z][A-Za-z0-9]{1,31});/;
const DEC_RE = /^&#([0-9]{1,7});/;
const HEX_RE = /^&#[xX]([0-9a-fA-F]{1,6});/;

/** Matches a character reference at `text[pos]` (which must be `&`). */
export function matchEntity(text: string, pos: number): EntityMatch | null {
  const slice = text.slice(pos, pos + 40);
  let m = NAMED_RE.exec(slice);
  if (m) {
    // `hasOwn` guards against names such as `constructor` resolving through the prototype.
    if (!Object.hasOwn(NAMED, m[1]!)) return null;
    return { value: NAMED[m[1]!]!, length: m[0].length };
  }
  m = DEC_RE.exec(slice) ?? HEX_RE.exec(slice);
  if (m) {
    const code = m[0][2] === 'x' || m[0][2] === 'X' ? parseInt(m[1]!, 16) : parseInt(m[1]!, 10);
    return { value: codePointToString(code), length: m[0].length };
  }
  return null;
}

export function codePointToString(code: number): string {
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
    return String.fromCharCode(0xfffd);
  return String.fromCodePoint(code);
}

/** Decodes every recognised reference in a string (used for URLs and titles). */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  let out = '';
  let pos = 0;
  while (pos < text.length) {
    const amp = text.indexOf('&', pos);
    if (amp === -1) {
      out += text.slice(pos);
      break;
    }
    out += text.slice(pos, amp);
    const match = matchEntity(text, amp);
    if (match) {
      out += match.value;
      pos = amp + match.length;
    } else {
      out += '&';
      pos = amp + 1;
    }
  }
  return out;
}

export function isKnownEntityName(name: string): boolean {
  return Object.hasOwn(NAMED, name);
}
