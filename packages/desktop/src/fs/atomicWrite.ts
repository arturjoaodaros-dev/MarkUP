// Porta de packages/desktop/Persistence/FileService.cs (fase WPF). A troca
// atômica em si fica mais simples aqui: `rename` do plugin-fs (que embrulha
// `std::fs::rename` do Rust) já substitui o destino se ele existir — ao
// contrário de `File.Move` do .NET, que recusa sobrescrever, então não
// precisa da ramificação exists()-então-Replace-senão-Move que o C# tinha.

import { exists, readTextFile, remove, writeTextFile, rename } from '@tauri-apps/plugin-fs';

function tempPathFor(path: string): string {
  const sep = path.includes('\\') ? '\\' : '/';
  const idx = path.lastIndexOf(sep);
  const dir = idx === -1 ? '' : path.slice(0, idx + 1);
  const name = idx === -1 ? path : path.slice(idx + 1);
  return `${dir}.${name}.tmp-${crypto.randomUUID()}`;
}

export async function readDocument(path: string): Promise<string> {
  return readTextFile(path);
}

/**
 * Nunca sobrescreve o arquivo original diretamente: grava num temporário no
 * mesmo diretório e só troca depois que a gravação teve sucesso — perda
 * silenciosa de dados é uma falha crítica (missão §25).
 */
export async function writeDocumentAtomic(path: string, content: string): Promise<void> {
  const tempPath = tempPathFor(path);
  await writeTextFile(tempPath, content);

  try {
    await rename(tempPath, path);
  } catch (error) {
    if (await exists(tempPath)) {
      await remove(tempPath).catch(() => {
        // Não deixa o erro de limpeza mascarar o erro real de escrita.
      });
    }
    throw error;
  }
}

/** Cria um documento novo — falha explicitamente se o caminho já existir (nunca sobrescreve por acidente ao "criar"). */
export async function createDocument(path: string, content: string): Promise<void> {
  if (await exists(path)) {
    throw new Error(`Já existe um arquivo em '${path}'.`);
  }
  await writeTextFile(path, content);
}
