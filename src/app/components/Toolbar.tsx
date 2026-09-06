import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Document as MarkupAst } from '../../markup/parser';
import { exportHtml } from '../../renderer/html/exportHtml';
import { useDocumentsStore } from '../state/documentsStore';
import type { EditorMode } from '../state/uiStore';
import { useUiStore } from '../state/uiStore';

const MODES: { id: EditorMode; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'preview', label: 'Preview' },
  { id: 'split', label: 'Split' },
];

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Toolbar({ ast, title }: { ast: MarkupAst; title: string }) {
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const createDocument = useDocumentsStore((s) => s.createDocument);
  const activeId = useDocumentsStore((s) => s.activeId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [copyLabel, setCopyLabel] = useState('Copiar HTML');

  function handleOpenFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((content) => {
      const docTitle = file.name.replace(/\.[^.]+$/, '');
      createDocument(docTitle, content);
    });
    e.target.value = '';
  }

  async function handleExportHtml() {
    const html = await exportHtml(ast, { title });
    download(`${title || 'documento'}.html`, html, 'text/html');
  }

  async function handleCopyHtml() {
    const html = await exportHtml(ast, { title });
    await navigator.clipboard.writeText(html);
    setCopyLabel('Copiado!');
    setTimeout(() => setCopyLabel('Copiar HTML'), 1500);
  }

  function handleSaveAs() {
    if (!activeId) return;
    // O autosave para localStorage já é contínuo; isto grava o arquivo-fonte
    // em disco, para levar o documento para fora do navegador.
    const content = useDocumentsStore.getState().documents[activeId]?.content ?? '';
    download(`${title || 'documento'}.markup`, content, 'text/markdown');
  }

  return (
    <div className="mu-toolbar">
      <button className="mu-icon-button" onClick={toggleSidebar} title="Alternar barra lateral" aria-label="Alternar barra lateral">
        ☰
      </button>

      <div className="mu-toolbar-group">
        <button onClick={() => createDocument()}>Novo</button>
        <button onClick={() => fileInputRef.current?.click()}>Abrir</button>
        <input ref={fileInputRef} type="file" accept=".md,.markup,.txt" hidden onChange={handleOpenFile} />
        <button onClick={handleSaveAs}>Salvar como…</button>
      </div>

      <div className="mu-mode-switch" role="tablist" aria-label="Modo de visualização">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} data-active={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="mu-toolbar-group mu-toolbar-end">
        <button onClick={handleExportHtml}>Exportar HTML</button>
        <button onClick={handleCopyHtml}>{copyLabel}</button>
        <button className="mu-icon-button" onClick={toggleTheme} title="Alternar tema" aria-label="Alternar tema">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </div>
  );
}
