import type { Progress as ProgressNode } from '@markup/core';

export function Progress({ node, sourceMapAttrs }: { node: ProgressNode; sourceMapAttrs?: Record<string, number> }) {
  const pct = node.max > 0 ? (node.value / node.max) * 100 : 0;
  return (
    <div className="mu-progress" {...sourceMapAttrs}>
      {node.label && (
        <div className="mu-progress-label">
          <span>{node.label}</span>
          <span>{node.value}/{node.max}</span>
        </div>
      )}
      <div className="mu-progress-track" role="progressbar" aria-valuenow={node.value} aria-valuemin={0} aria-valuemax={node.max}>
        <div className="mu-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
