interface StatusBarProps {
  rootPath: string | null;
  activeText: string | null;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function StatusBar({ rootPath, activeText }: StatusBarProps) {
  return (
    <div className="mkd-statusbar">
      <span>{rootPath ?? 'Nenhuma pasta aberta'}</span>
      <span>{activeText !== null ? `${wordCount(activeText)} palavras` : ''}</span>
    </div>
  );
}
