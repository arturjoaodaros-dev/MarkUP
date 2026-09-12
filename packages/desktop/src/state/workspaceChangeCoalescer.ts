// Porta de packages/desktop/Workspace/WorkspaceChangeCoalescer.cs (fase WPF)
// — o Rust já debounça por tempo (notify-debouncer-full, 300ms), mas isso
// não garante que um create+delete do mesmo arquivo dentro da mesma janela
// se cancele logicamente; esta segunda camada, mais barata que confiar cega
// numa semântica de cancelamento não documentada da crate, garante isso.

import type { WorkspaceChange, WorkspaceChangeKind } from './workspaceTypes';

export class WorkspaceChangeCoalescer {
  private pending = new Map<string, WorkspaceChangeKind>();

  enqueue(path: string, kind: WorkspaceChangeKind): void {
    const existing = this.pending.get(path);
    if (existing === 'created' && kind === 'removed') {
      // Nunca existiu do ponto de vista de quem observa.
      this.pending.delete(path);
      return;
    }
    this.pending.set(path, kind);
  }

  flush(): WorkspaceChange[] {
    const batch = Array.from(this.pending, ([path, kind]) => ({ path, kind }));
    this.pending.clear();
    return batch;
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }
}
