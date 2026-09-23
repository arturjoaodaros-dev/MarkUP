import { BookOpen, FilePlus, FolderOpen, History } from 'lucide-react';
import { useAppState, useWorkbench } from '../context.ts';
import { basename } from '../fs/types.ts';
import { formatShortcut } from '../lib/keys.ts';

export function Welcome() {
  const { wb } = useWorkbench();
  const workspace = useAppState((s) => s.workspace);
  const recent = useAppState((s) => s.recent);

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <img className="welcome-logo" src="/icon.svg" alt="" width={56} height={56} />
        <h1>MarkUP</h1>
        <p className="welcome-tagline">
          Markdown with components. Write, check and preview in one place.
        </p>

        <div className="welcome-actions">
          {workspace ? (
            <button
              type="button"
              className="button is-primary"
              onClick={() => wb.startCreate('new-file')}
            >
              <FilePlus size={16} /> New file
            </button>
          ) : (
            <button
              type="button"
              className="button is-primary"
              onClick={() => void wb.pickAndOpenFolder()}
            >
              <FolderOpen size={16} /> Open folder
            </button>
          )}
          {wb.fs.kind === 'memory' && (
            <button type="button" className="button" onClick={() => void wb.openSamples()}>
              <BookOpen size={16} /> Open samples
            </button>
          )}
          {workspace && (
            <button type="button" className="button" onClick={() => wb.openPalette('files')}>
              Go to file… <kbd>{formatShortcut('mod+p')}</kbd>
            </button>
          )}
        </div>

        {!workspace && recent.length > 0 && (
          <div className="welcome-section">
            <h2>
              <History size={14} /> Recent
            </h2>
            <ul className="welcome-recent">
              {recent.map((path) => (
                <li key={path}>
                  <button type="button" onClick={() => void wb.openWorkspace(path)}>
                    <span className="recent-name">{basename(path) || path}</span>
                    <span className="recent-path">{path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <dl className="welcome-keys">
          {[
            ['Command palette', 'mod+shift+p'],
            ['Quick open', 'mod+p'],
            ['Insert component', 'mod+alt+i'],
            ['Toggle preview', 'mod+\\'],
          ].map(([label, key]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>
                <kbd>{formatShortcut(key!)}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
