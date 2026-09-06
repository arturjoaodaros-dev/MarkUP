import type { MathBlock } from '@markup/core';
import { useExportResolved } from '../ExportContext';
import { renderMathHtml } from '../lazyLibs';
import { AsyncHtml } from './AsyncHtml';

export function Math({ node }: { node: MathBlock }) {
  const resolved = useExportResolved();
  const html = resolved?.math.get(node);

  return (
    <div className="mu-math">
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
