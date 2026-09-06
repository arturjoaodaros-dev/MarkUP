import type { Alert as AlertNode } from '@markup/core';
import { BlockList } from '../MarkupDocument';

const ICONS: Record<AlertNode['level'], string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
};

export function Alert({ node }: { node: AlertNode }) {
  return (
    <div className="mu-alert" data-level={node.level} role="alert">
      <span className="mu-alert-icon" aria-hidden="true">
        {ICONS[node.level]}
      </span>
      <div className="mu-alert-content">
        {node.title && <p className="mu-alert-title">{node.title}</p>}
        <BlockList nodes={node.children} />
      </div>
    </div>
  );
}
