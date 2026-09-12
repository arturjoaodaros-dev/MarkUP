import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { RefreshCw } from 'lucide-react';
import { parse } from '@markup/core';
import { MarkupDocument, type WikiLinkResolution } from '@markup/renderer';
import { useAppStore } from '../state/appStore';
import type { PreviewSettings } from '../fs/settings';

interface PreviewPaneProps {
  /** Já resolvido pelo chamador conforme `updateMode` ('onSave' passa `savedText`, os demais passam o texto vivo). */
  source: string;
  collapsed: boolean;
  tabId: string | null;
  updateMode: PreviewSettings['updateMode'];
  maxWidth: number | null;
}

/**
 * Renderização real do documento (missão §9) — mesmo `@markup/renderer` do
 * site de documentação e da extensão VS Code, chamado direto (sem ponte
 * postMessage: editor, explorer e preview vivem na mesma árvore React).
 *
 * No modo "manual" o preview fica congelado no último `source` pedido
 * explicitamente (botão de atualizar) até o usuário trocar de aba — troca de
 * aba sempre atualiza na hora, porque é um documento novo, não uma edição
 * pendente do mesmo documento.
 */
export function PreviewPane({ source, collapsed, tabId, updateMode, maxWidth }: PreviewPaneProps) {
  const resolveWikiLink = useAppStore((s) => s.resolveWikiLink);
  const theme = useAppStore((s) => s.resolvedTheme);
  const [manualSource, setManualSource] = useState(source);

  useEffect(() => {
    setManualSource(source);
    // Só quando o documento em si troca (tabId) — não a cada tecla — pra não
    // derrubar o propósito do modo manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  const effectiveSource = updateMode === 'manual' ? manualSource : source;
  const { ast } = useMemo(() => parse(effectiveSource), [effectiveSource]);

  const resolve = (target: string): WikiLinkResolution => resolveWikiLink(target);

  const bodyStyle: CSSProperties | undefined = maxWidth
    ? ({ '--mkd-preview-max-width': `${maxWidth}px` } as CSSProperties)
    : undefined;

  return (
    <div className="mkd-preview-pane" data-collapsed={collapsed}>
      <div className="mkd-preview-header">
        <span>Preview</span>
        {updateMode === 'manual' && (
          <button
            className="mkd-preview-toggle"
            title="Atualizar preview"
            onClick={() => setManualSource(source)}
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>
      <div className={`mkd-preview-body mu-document-root mu-theme-${theme}`} style={bodyStyle}>
        <MarkupDocument document={ast} resolveWikiLink={resolve} />
      </div>
    </div>
  );
}
