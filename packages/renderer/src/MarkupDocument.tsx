// Dispatcher central AST → React. Um `type` de BlockNode sem tratamento
// aqui é erro de compilação do TypeScript (o `default` abaixo é
// inalcançável e tipado como `never`), o que garante que nenhum nó novo
// passe despercebido quando a linguagem crescer.

import { createContext, useContext } from 'react';
import type { BlockNode, Document, InlineNode, Position } from '@markup/core';
import { inlineText, slugifyHeading } from '@markup/core';
import { Alert } from './components/Alert';
import { Card } from './components/Card';
import { Chart } from './components/Chart';
import { CodeBlock } from './components/CodeBlock';
import { Math } from './components/Math';
import { Progress } from './components/Progress';
import { Table } from './components/Table';
import { Tabs } from './components/Tabs';

// Desligado por padrão: o preview do app web e a exportação de HTML não
// precisam desses atributos. Só a extensão do VS Code liga `sourceMap` para
// poder mapear um clique no preview de volta para a posição real no editor,
// usando os offsets que a AST já carrega — nunca busca de texto.
const SourceMapContext = createContext(false);

// Desligado por padrão pelo mesmo motivo do sourceMap: só quem precisa de
// links profundos para cada heading (o site de documentação, por exemplo)
// liga `anchors`. O `Map` de desambiguação de slugs repetidos é criado uma
// vez por chamada de `MarkupDocument` — nunca em escopo de módulo — para
// não vazar estado entre documentos renderizados em paralelo (ex.: várias
// páginas do site, ou SSR concorrente).
interface AnchorState {
  enabled: boolean;
  seen: Map<string, number>;
}
const AnchorContext = createContext<AnchorState>({ enabled: false, seen: new Map() });

function sourceMapAttrs(position: Position, enabled: boolean): Record<string, number> {
  if (!enabled) return {};
  return { 'data-mu-start': position.start.offset, 'data-mu-end': position.end.offset };
}

export function MarkupDocument({
  document,
  sourceMap = false,
  anchors = false,
}: {
  document: Document;
  sourceMap?: boolean;
  anchors?: boolean;
}) {
  const anchorState: AnchorState = { enabled: anchors, seen: new Map() };
  return (
    <SourceMapContext.Provider value={sourceMap}>
      <AnchorContext.Provider value={anchorState}>
        <div className="mu-document">
          <BlockList nodes={document.children} />
        </div>
      </AnchorContext.Provider>
    </SourceMapContext.Provider>
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
  const sourceMap = useContext(SourceMapContext);
  const anchorState = useContext(AnchorContext);
  const pos = sourceMapAttrs(node.position, sourceMap);

  switch (node.type) {
    case 'heading': {
      const Tag = `h${node.depth}` as const;
      const id = anchorState.enabled ? slugifyHeading(inlineText(node.children), anchorState.seen) : undefined;
      return (
        <Tag className="mu-heading" id={id} {...pos}>
          <InlineList nodes={node.children} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className="mu-paragraph" {...pos}>
          <InlineList nodes={node.children} />
        </p>
      );
    case 'list': {
      const Tag = node.ordered ? 'ol' : 'ul';
      return (
        <Tag className="mu-list" start={node.ordered ? node.start : undefined} {...pos}>
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
        <blockquote className="mu-blockquote" {...pos}>
          <BlockList nodes={node.children} />
        </blockquote>
      );
    case 'codeBlock':
      return <CodeBlock node={node} sourceMapAttrs={pos} />;
    case 'table':
      return <Table node={node} sourceMapAttrs={pos} />;
    case 'thematicBreak':
      return <hr className="mu-hr" {...pos} />;
    case 'chart':
      return <Chart node={node} sourceMapAttrs={pos} />;
    case 'card':
      return <Card node={node} sourceMapAttrs={pos} />;
    case 'alert':
      return <Alert node={node} sourceMapAttrs={pos} />;
    case 'progress':
      return <Progress node={node} sourceMapAttrs={pos} />;
    case 'math':
      return <Math node={node} sourceMapAttrs={pos} />;
    case 'tabs':
      return <Tabs node={node} sourceMapAttrs={pos} />;
    case 'unknownDirective':
      return (
        <div className="mu-unknown-directive" {...pos}>
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
    case 'strikethrough':
      return (
        <del>
          <InlineList nodes={node.children} />
        </del>
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
