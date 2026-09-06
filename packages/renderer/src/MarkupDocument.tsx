// Dispatcher central AST → React. Um `type` de BlockNode sem tratamento
// aqui é erro de compilação do TypeScript (o `default` abaixo é
// inalcançável e tipado como `never`), o que garante que nenhum nó novo
// passe despercebido quando a linguagem crescer.

import type { BlockNode, Document, InlineNode } from '../markup/parser';
import { Alert } from './components/Alert';
import { Card } from './components/Card';
import { Chart } from './components/Chart';
import { CodeBlock } from './components/CodeBlock';
import { Math } from './components/Math';
import { Progress } from './components/Progress';
import { Table } from './components/Table';
import { Tabs } from './components/Tabs';

export function MarkupDocument({ document }: { document: Document }) {
  return (
    <div className="mu-document">
      <BlockList nodes={document.children} />
    </div>
  );
}

export function BlockList({ nodes }: { nodes: BlockNode[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <BlockRenderer key={i} node={node} />
      ))}
    </>
  );
}

function BlockRenderer({ node }: { node: BlockNode }) {
  switch (node.type) {
    case 'heading': {
      const Tag = `h${node.depth}` as const;
      return (
        <Tag className="mu-heading">
          <InlineList nodes={node.children} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className="mu-paragraph">
          <InlineList nodes={node.children} />
        </p>
      );
    case 'list': {
      const Tag = node.ordered ? 'ol' : 'ul';
      return (
        <Tag className="mu-list" start={node.ordered ? node.start : undefined}>
          {node.items.map((item, i) => (
            <li key={i}>
              <BlockList nodes={item.children} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'blockquote':
      return (
        <blockquote className="mu-blockquote">
          <BlockList nodes={node.children} />
        </blockquote>
      );
    case 'codeBlock':
      return <CodeBlock node={node} />;
    case 'table':
      return <Table node={node} />;
    case 'thematicBreak':
      return <hr className="mu-hr" />;
    case 'chart':
      return <Chart node={node} />;
    case 'card':
      return <Card node={node} />;
    case 'alert':
      return <Alert node={node} />;
    case 'progress':
      return <Progress node={node} />;
    case 'math':
      return <Math node={node} />;
    case 'tabs':
      return <Tabs node={node} />;
    case 'unknownDirective':
      return (
        <div className="mu-unknown-directive">
          Diretiva desconhecida: <code>:::{node.name}</code>
        </div>
      );
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

export function InlineList({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineRenderer key={i} node={node} />
      ))}
    </>
  );
}

function InlineRenderer({ node }: { node: InlineNode }) {
  switch (node.type) {
    case 'text':
      return <>{node.value}</>;
    case 'strong':
      return (
        <strong>
          <InlineList nodes={node.children} />
        </strong>
      );
    case 'emphasis':
      return (
        <em>
          <InlineList nodes={node.children} />
        </em>
      );
    case 'inlineCode':
      return <code className="mu-inline-code">{node.value}</code>;
    case 'link':
      return (
        <a href={node.url} title={node.title} target="_blank" rel="noopener noreferrer">
          <InlineList nodes={node.children} />
        </a>
      );
    case 'image':
      return <img src={node.url} alt={node.alt} title={node.title} className="mu-image" />;
    case 'break':
      return <br />;
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}
