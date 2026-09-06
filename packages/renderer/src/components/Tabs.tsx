import { useId, useState } from 'react';
import type { Tabs as TabsNode } from '@markup/core';
import { BlockList } from '../MarkupDocument';

export function Tabs({ node }: { node: TabsNode }) {
  const [active, setActive] = useState(0);
  const baseId = useId();

  if (node.tabs.length === 0) {
    return <p className="mu-empty">Nenhuma aba definida.</p>;
  }

  return (
    <div className="mu-tabs">
      <div className="mu-tabs-list" role="tablist">
        {node.tabs.map((tab, i) => (
          <button
            key={tab.title + i}
            type="button"
            role="tab"
            id={`${baseId}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${i}`}
            className="mu-tab-button"
            data-active={i === active}
            onClick={() => setActive(i)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      {node.tabs.map((tab, i) => (
        <div
          key={tab.title + i}
          role="tabpanel"
          id={`${baseId}-panel-${i}`}
          aria-labelledby={`${baseId}-tab-${i}`}
          hidden={i !== active}
          className="mu-tab-panel"
        >
          <BlockList nodes={tab.children} />
        </div>
      ))}
    </div>
  );
}
