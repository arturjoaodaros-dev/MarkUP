// Parser de atributos de diretiva: `type="bar" title="Vendas" flag`.
//
// Suporta três formas por atributo:
//   key="value with spaces"
//   key=value           (sem espaços, sem aspas)
//   flag                (booleano implícito: true)

export type AttributeValue = string | boolean;
export type Attributes = Record<string, AttributeValue>;

const ATTR_RE = /([A-Za-z_][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

export function parseAttributes(input: string): Attributes {
  const attrs: Attributes = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(input))) {
    const [, key, dquoted, squoted, bare] = match;
    if (dquoted !== undefined) attrs[key] = dquoted;
    else if (squoted !== undefined) attrs[key] = squoted;
    else if (bare !== undefined) attrs[key] = bare;
    else attrs[key] = true;
  }
  return attrs;
}

export function attrString(attrs: Attributes, key: string): string | undefined {
  const v = attrs[key];
  return typeof v === 'string' ? v : undefined;
}

export function attrNumber(attrs: Attributes, key: string): number | undefined {
  const v = attrString(attrs, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
