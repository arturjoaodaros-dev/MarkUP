const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}

const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;

/** Renders `name="value"` pairs, skipping null/false and unsafe names. `true` renders a bare attribute. */
export function attributes(attrs: Record<string, string | number | boolean | null | undefined>): string {
  let out = '';
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false || !ATTRIBUTE_NAME.test(name)) continue;
    // Event handlers and inline styles are never emitted from document content.
    if (/^on/i.test(name) || name.toLowerCase() === 'style') continue;
    out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
  }
  return out;
}
