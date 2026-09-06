import type { Document as MarkupAst } from '@markup/core';
import { collectHeadings } from '@markup/core';
import { useDocumentsStore } from '../state/documentsStore';
import { templates } from '../templates';

export function Sidebar({ ast }: { ast: MarkupAst }) {
  const documents = useDocumentsStore((s) => s.documents);
  const order = useDocumentsStore((s) => s.order);
  const activeId = useDocumentsStore((s) => s.activeId);
  const openDocument = useDocumentsStore((s) => s.openDocument);
  const deleteDocument = useDocumentsStore((s) => s.deleteDocument);
  const createDocument = useDocumentsStore((s) => s.createDocument);

  const headings = collectHeadings(ast);

  return (
    <aside className="mu-sidebar">
      <section className="mu-sidebar-section">
        <h3>Documentos</h3>
        <ul className="mu-doc-list">
          {order.map((id) => {
            const doc = documents[id];
            if (!doc) return null;
            return (
              <li key={id}>
                <button
                  className="mu-doc-item"
                  data-active={id === activeId}
                  onClick={() => openDocument(id)}
                  title={doc.title}
                >
                  {doc.title || 'Sem título'}
                </button>
                {order.length > 1 && (
                  <button
                    className="mu-doc-remove"
                    aria-label={`Excluir ${doc.title}`}
                    title="Excluir documento"
                    onClick={() => deleteDocument(id)}
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mu-sidebar-section">
        <h3>Estrutura</h3>
        {headings.length === 0 ? (
          <p className="mu-sidebar-empty">Sem headings.</p>
        ) : (
          <ul className="mu-outline-list">
            {headings.map((h, i) => (
              <li key={i} style={{ paddingLeft: `${(h.depth - 1) * 0.75}em` }}>
                {h.text || '(sem título)'}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mu-sidebar-section">
        <h3>Templates</h3>
        <ul className="mu-doc-list">
          {templates.map((t) => (
            <li key={t.id}>
              <button className="mu-doc-item" onClick={() => createDocument(t.title, t.content)}>
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
