// KaTeX e highlight.js só são carregados quando o documento realmente usa
// ":::math" ou um bloco de código, mantendo o bundle inicial pequeno. Os
// dois caminhos (preview ao vivo e exportação de HTML) passam pelas mesmas
// funções, o que é o que garante que o HTML exportado seja idêntico ao
// preview.

let katexPromise: Promise<typeof import('katex')> | null = null;
function loadKatex() {
  if (!katexPromise) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([mod]) => mod);
  }
  return katexPromise;
}

let hljsPromise: Promise<typeof import('highlight.js')> | null = null;
function loadHighlight() {
  hljsPromise ??= import('highlight.js');
  return hljsPromise;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderMathHtml(value: string): Promise<string> {
  try {
    const katex = await loadKatex();
    return katex.default.renderToString(value, { throwOnError: false, displayMode: true });
  } catch {
    return `<span class="mu-math-error">${escapeHtml(value)}</span>`;
  }
}

export async function highlightCodeHtml(code: string, lang?: string): Promise<{ html: string; language?: string }> {
  try {
    const hljs = await loadHighlight();
    if (lang && hljs.default.getLanguage(lang)) {
      const result = hljs.default.highlight(code, { language: lang });
      return { html: result.value, language: lang };
    }
    const auto = hljs.default.highlightAuto(code);
    return { html: auto.value, language: auto.language };
  } catch {
    return { html: escapeHtml(code) };
  }
}
