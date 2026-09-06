import type { Diagnostic } from '@markup/core';

export function ProblemsPanel({ diagnostics, onClose }: { diagnostics: Diagnostic[]; onClose: () => void }) {
  return (
    <div className="mu-problems-panel">
      <div className="mu-problems-header">
        <span>Problemas ({diagnostics.length})</span>
        <button className="mu-icon-button" onClick={onClose} aria-label="Fechar painel de problemas">
          ×
        </button>
      </div>
      {diagnostics.length === 0 ? (
        <p className="mu-sidebar-empty">Nenhum problema encontrado.</p>
      ) : (
        <ul className="mu-problems-list">
          {diagnostics.map((d, i) => (
            <li key={i} data-severity={d.severity}>
              <span className="mu-problem-icon">{d.severity === 'error' ? '✕' : '⚠'}</span>
              <span className="mu-problem-message">{d.message}</span>
              <span className="mu-problem-location">
                {d.position.start.line}:{d.position.start.column}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
