import type { Card as CardNode } from '@markup/core';
import { BlockList } from '../MarkupDocument';

export function Card({ node, sourceMapAttrs }: { node: CardNode; sourceMapAttrs?: Record<string, number> }) {
  return (
    <div className="mu-card" {...sourceMapAttrs}>
      {node.title && <h4 className="mu-card-title">{node.title}</h4>}
      {node.metrics.length > 0 && (
        <dl className="mu-card-metrics">
          {node.metrics.map((m) => (
            <div className="mu-card-metric" key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {node.children.length > 0 && (
        <div className="mu-card-body">
          <BlockList nodes={node.children} />
        </div>
      )}
    </div>
  );
}
