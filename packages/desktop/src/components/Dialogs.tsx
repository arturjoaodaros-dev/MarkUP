import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/appStore';

function fileNameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

export function NewDocumentDialog() {
  const isOpen = useAppStore((s) => s.isNewDocumentDialogOpen);
  const setOpen = useAppStore((s) => s.setNewDocumentDialogOpen);
  const createNewDocument = useAppStore((s) => s.createNewDocument);
  const defaultExtension = useAppStore((s) => s.settings.markup.defaultExtension);
  const [name, setName] = useState(`novo-documento${defaultExtension}`);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(`novo-documento${defaultExtension}`);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isOpen, defaultExtension]);

  if (!isOpen) return null;

  function submit() {
    if (!name.trim()) return;
    setOpen(false);
    void createNewDocument(name.trim());
  }

  return (
    <div className="mkd-overlay-backdrop" onClick={() => setOpen(false)}>
      <div className="mkd-dialog" onClick={(e) => e.stopPropagation()}>
        <p>Nome do novo documento</p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        <div className="mkd-dialog-actions">
          <button className="mkd-button" onClick={() => setOpen(false)}>
            Cancelar
          </button>
          <button className="mkd-button" onClick={submit}>
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}

export function RenameDialog() {
  const path = useAppStore((s) => s.pendingRenamePath);
  const confirmRename = useAppStore((s) => s.confirmRename);
  const cancelRename = useAppStore((s) => s.cancelRename);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (path) {
      setName(fileNameOf(path));
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [path]);

  if (!path) return null;

  function submit() {
    if (!name.trim()) return;
    void confirmRename(name.trim());
  }

  return (
    <div className="mkd-overlay-backdrop" onClick={cancelRename}>
      <div className="mkd-dialog" onClick={(e) => e.stopPropagation()}>
        <p>Renomear '{fileNameOf(path)}'</p>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') cancelRename();
          }}
        />
        <div className="mkd-dialog-actions">
          <button className="mkd-button" onClick={cancelRename}>
            Cancelar
          </button>
          <button className="mkd-button" onClick={submit}>
            Renomear
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteConfirmDialog() {
  const path = useAppStore((s) => s.pendingDeletePath);
  const confirmDelete = useAppStore((s) => s.confirmDelete);
  const cancelDelete = useAppStore((s) => s.cancelDelete);

  if (!path) return null;

  return (
    <div className="mkd-overlay-backdrop" onClick={cancelDelete}>
      <div className="mkd-dialog" onClick={(e) => e.stopPropagation()}>
        <p>Excluir '{fileNameOf(path)}'? Isso não pode ser desfeito.</p>
        <div className="mkd-dialog-actions">
          <button className="mkd-button" onClick={cancelDelete}>
            Cancelar
          </button>
          <button className="mkd-button" onClick={() => void confirmDelete()}>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

export function CloseTabConfirmDialog() {
  const tabId = useAppStore((s) => s.pendingCloseTabId);
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === tabId));
  const confirmCloseTab = useAppStore((s) => s.confirmCloseTab);

  if (!tabId || !tab) return null;

  return (
    <div className="mkd-overlay-backdrop" onClick={() => void confirmCloseTab('cancel')}>
      <div className="mkd-dialog" onClick={(e) => e.stopPropagation()}>
        <p>Salvar as alterações em '{fileNameOf(tab.filePath)}' antes de fechar?</p>
        <div className="mkd-dialog-actions">
          <button className="mkd-button" onClick={() => void confirmCloseTab('cancel')}>
            Cancelar
          </button>
          <button className="mkd-button" onClick={() => void confirmCloseTab('discard')}>
            Descartar
          </button>
          <button className="mkd-button" onClick={() => void confirmCloseTab('save')}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConflictDialog() {
  const pending = useAppStore((s) => s.pendingConflict);
  const resolveKeepExternal = useAppStore((s) => s.resolveConflictKeepExternal);
  const resolveKeepMine = useAppStore((s) => s.resolveConflictKeepMine);
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === pending?.tabId));

  if (!pending || !tab) return null;

  return (
    <div className="mkd-overlay-backdrop">
      <div className="mkd-dialog" onClick={(e) => e.stopPropagation()}>
        <p>
          '{fileNameOf(tab.filePath)}' foi alterado fora do MarkUP enquanto você tinha mudanças não salvas aqui.
          Recarregar substitui o que você editou pela versão externa. Manter a sua mantém o que está na tela — salvar
          depois sobrescreve o arquivo externo.
        </p>
        <div className="mkd-dialog-actions">
          <button className="mkd-button" onClick={resolveKeepMine}>
            Manter a minha
          </button>
          <button className="mkd-button" onClick={resolveKeepExternal}>
            Recarregar
          </button>
        </div>
      </div>
    </div>
  );
}
