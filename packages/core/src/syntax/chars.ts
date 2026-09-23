/** Character classes shared by the scanners. */

const UNICODE_WHITESPACE = /^[\s\p{Zs}]$/u;
const UNICODE_PUNCTUATION = /^[\p{P}\p{S}]$/u;
const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/;
const ALNUM = /^[\p{L}\p{N}]$/u;

export function isAsciiPunctuation(c: string | undefined): boolean {
  return c !== undefined && ASCII_PUNCTUATION.test(c);
}

/** Start of text and end of text count as whitespace for flanking purposes. */
export function isUnicodeWhitespace(c: string | undefined): boolean {
  return c === undefined || c === '' || UNICODE_WHITESPACE.test(c);
}

export function isUnicodePunctuation(c: string | undefined): boolean {
  return c !== undefined && c !== '' && UNICODE_PUNCTUATION.test(c);
}

export function isAlphanumeric(c: string | undefined): boolean {
  return c !== undefined && c !== '' && ALNUM.test(c);
}

/** The full code point ending just before `pos` (handles surrogate pairs). */
export function charBefore(text: string, pos: number): string | undefined {
  if (pos <= 0) return undefined;
  const low = text.charCodeAt(pos - 1);
  if (low >= 0xdc00 && low <= 0xdfff && pos >= 2) {
    const high = text.charCodeAt(pos - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(pos - 2, pos);
  }
  return text[pos - 1];
}

/** The full code point starting at `pos` (handles surrogate pairs). */
export function charAt(text: string, pos: number): string | undefined {
  if (pos >= text.length) return undefined;
  const cp = text.codePointAt(pos);
  return cp === undefined ? undefined : String.fromCodePoint(cp);
}

export function isSpaceOrTab(c: number): boolean {
  return c === 0x20 || c === 0x09;
}

export function isAsciiLetter(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

export function isAsciiDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

/** Directive names: `[A-Za-z][A-Za-z0-9_-]*`. */
export function isNameStart(c: number): boolean {
  return isAsciiLetter(c);
}

export function isNameChar(c: number): boolean {
  return isAsciiLetter(c) || isAsciiDigit(c) || c === 0x2d /* - */ || c === 0x5f /* _ */;
}

/** Reads a directive name at `pos`; returns its end index or `pos` when there is none. */
export function readName(text: string, pos: number): number {
  if (!isNameStart(text.charCodeAt(pos))) return pos;
  let end = pos + 1;
  while (end < text.length && isNameChar(text.charCodeAt(end))) end++;
  return end;
}
