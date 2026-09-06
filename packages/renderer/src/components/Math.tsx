import type { MathBlock } from '@markup/core';
import { useExportResolved } from '../ExportContext';
import { renderMathHtml } from '../lazyLibs';
import { AsyncHtml } from './AsyncHtml';

export function Math({ node, sourceMapAttrs }: { node: MathBlock; sourceMapAttrs?: Record<string, number> }) {
  const resolved = useExportResolved();
  const html = resolved?.math.get(node);

  return (
    <div className="mu-math" {...sourceMapAttrs}>
      {html !== undefined ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <AsyncHtml
          as="div"
          loader={() => renderMathHtml(node.value)}
          deps={[node.value]}
          fallback={<code>{node.value}</code>}
        />
      )}
    </div>
  );
}
