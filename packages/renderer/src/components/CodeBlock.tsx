import type { CodeBlock as CodeBlockNode } from '@markup/core';
import { useExportResolved } from '../ExportContext';
import { highlightCodeHtml } from '../lazyLibs';
import { AsyncHtml } from './AsyncHtml';

export function CodeBlock({ node }: { node: CodeBlockNode }) {
  const resolved = useExportResolved();
  const entry = resolved?.code.get(node);

  return (
    <pre className="mu-code">
      {node.lang && <span className="mu-code-lang">{node.lang}</span>}
      {entry !== undefined ? (
        <code dangerouslySetInnerHTML={{ __html: entry.html }} />
      ) : (
        <AsyncHtml
          as="code"
          loader={() => highlightCodeHtml(node.value, node.lang).then((r) => r.html)}
          deps={[node.value, node.lang]}
          fallback={node.value}
        />
      )}
    </pre>
  );
}
