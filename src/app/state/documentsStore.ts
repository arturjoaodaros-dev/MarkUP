import { create } from 'zustand';
import { localStorageRepository } from '../storage/localStorageRepository';
import type { StoredDocument } from '../storage/DocumentRepository';
import { templates } from '../templates';

function makeId(): string {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface DocumentsState {
  documents: Record<string, StoredDocument>;
  order: string[];
  activeId: string | null;
  createDocument: (title?: string, content?: string) => string;
  openDocument: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  renameDocument: (id: string, title: string) => void;
  deleteDocument: (id: string) => void;
}

function loadInitial(): { documents: Record<string, StoredDocument>; order: string[] } {
  const stored = localStorageRepository.list();
  if (stored.length > 0) {
    const documents: Record<string, StoredDocument> = {};
    for (const doc of stored) documents[doc.id] = doc;
    return { documents, order: stored.map((d) => d.id) };
  }
  // Primeira execução: semear com o template de exemplo, para que a
  // aplicação nunca abra vazia.
  const seed = templates[1]; // "Relatório de vendas"
  const now = Date.now();
  const doc: StoredDocument = { id: makeId(), title: seed.title, content: seed.content, createdAt: now, updatedAt: now };
  localStorageRepository.save(doc);
  return { documents: { [doc.id]: doc }, order: [doc.id] };
}

const initial = loadInitial();

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: initial.documents,
  order: initial.order,
  activeId: initial.order[0] ?? null,

  createDocument(title = 'Sem título', content = '# Sem título\n\n') {
    const now = Date.now();
    const doc: StoredDocument = { id: makeId(), title, content, createdAt: now, updatedAt: now };
    localStorageRepository.save(doc);
    set((s) => ({ documents: { ...s.documents, [doc.id]: doc }, order: [doc.id, ...s.order], activeId: doc.id }));
    return doc.id;
  },

  openDocument(id) {
    if (get().documents[id]) set({ activeId: id });
  },

  updateContent(id, content) {
    const doc = get().documents[id];
    if (!doc) return;
    const updated: StoredDocument = { ...doc, content, updatedAt: Date.now() };
    localStorageRepository.save(updated);
    set((s) => ({ documents: { ...s.documents, [id]: updated } }));
  },

  renameDocument(id, title) {
    const doc = get().documents[id];
    if (!doc) return;
    const updated: StoredDocument = { ...doc, title, updatedAt: Date.now() };
    localStorageRepository.save(updated);
    set((s) => ({ documents: { ...s.documents, [id]: updated } }));
  },

  deleteDocument(id) {
    localStorageRepository.remove(id);
    set((s) => {
      const documents = { ...s.documents };
      delete documents[id];
      const order = s.order.filter((x) => x !== id);
      const activeId = s.activeId === id ? (order[0] ?? null) : s.activeId;
      return { documents, order, activeId };
    });
  },
}));
