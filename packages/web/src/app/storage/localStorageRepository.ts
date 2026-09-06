import type { DocumentRepository, StoredDocument } from './DocumentRepository';

const KEY = 'markup:documents:v1';

function readAll(): Record<string, StoredDocument> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredDocument>) : {};
  } catch {
    // Storage indisponível (modo privado, cota excedida, JSON corrompido):
    // a aplicação continua funcionando em memória, apenas sem persistência.
    return {};
  }
}

function writeAll(docs: Record<string, StoredDocument>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(docs));
  } catch {
    // Silenciosamente ignorado — ver comentário em readAll.
  }
}

export const localStorageRepository: DocumentRepository = {
  list() {
    return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  save(doc) {
    const all = readAll();
    all[doc.id] = doc;
    writeAll(all);
  },
  remove(id) {
    const all = readAll();
    delete all[id];
    writeAll(all);
  },
};
