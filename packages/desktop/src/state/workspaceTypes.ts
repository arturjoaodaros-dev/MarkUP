// Tipos compartilhados do domínio de workspace. O formato de `WorkspaceChange`
// espelha exatamente o payload que `src-tauri/src/watcher.rs` serializa via
// serde (`#[serde(rename_all = "camelCase")]`) — os dois lados precisam
// concordar sem um contrato formal além desta correspondência manual.

export type WorkspaceChangeKind = 'created' | 'modified' | 'removed';

export interface WorkspaceChange {
  kind: WorkspaceChangeKind;
  path: string;
  /** Vem do Rust via `Path::is_dir()` no instante do evento — evita ter que adivinhar pasta-vs-arquivo só pela extensão (ver watcher.rs). */
  isDirectory?: boolean;
}

/**
 * Nó da árvore do workspace. Ao contrário da versão C# (árvore de objetos
 * aninhados), aqui cada nó só guarda os *caminhos* dos filhos — o estado
 * autoritativo é o mapa achatado `nodes` em {@link WorkspaceIndexState}.
 * Isso torna atualização incremental trivial (mexer numa entrada do mapa
 * nunca exige tocar nos ancestrais) e é mais idiomático para o modelo de
 * atualização do Zustand do que replicar a árvore de objetos do WPF.
 */
export interface DocumentNode {
  name: string;
  path: string;
  isDirectory: boolean;
  childPaths: string[];
}

export interface WorkspaceIndexState {
  rootPath: string;
  nodes: Record<string, DocumentNode>;
}
