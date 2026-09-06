// Abstração de persistência de documentos. A aplicação inteira depende
// apenas desta interface, nunca de `localStorage` diretamente — trocar por
// IndexedDB (documentos maiores, múltiplas abas) mais tarde é implementar
// esta interface de novo, sem tocar em `documentsStore` ou na UI.

export interface StoredDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  createdAt: number;
}

export interface DocumentRepository {
  list(): StoredDocument[];
  save(doc: StoredDocument): void;
  remove(id: string): void;
}
