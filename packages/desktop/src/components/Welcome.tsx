import { useAppState, useWorkbench } from '../context.ts';
import { basename } from '../fs/types.ts';
import { formatShortcut } from '../lib/keys.ts';
import { Logo } from './Logo.tsx';

/** Shown when no document is open: how to start, recent folders, the essential shortcuts. */
export function Welcome() {
  const { wb, commands } = useWorkbench();
  const workspace = useAppState((s) => s.workspace);
  const recent = useAppState((s) => s.recent);
  const byId = new Map(commands.map((c) => [c.id, c]));

  const action = (id: string, label?: string) => {
    const command = byId.get(id);
    if (!command || command.available?.() === false) return null;
    const shortcut = command.shortcuts?.[0];
    return (
      <li key={id}>
        <button type="button" className="start-link" onClick={() => void command.run()}>
          {label ?? command.title}
        </button>
        {shortcut && <kbd>{formatShortcut(shortcut)}</kbd>}
      </li>
    );
  };

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>
          {!workspace && <Logo size={24} />}
          {workspace ? workspace.name : 'MarkUP'}
        </h1>
        <p className="welcome-lead">
          {workspace
            ? 'Open a file from the sidebar, or:'
            : 'Open a folder of .markup, .mkup or .md files to start.'}
        </p>

        <section>
          <h2>Start</h2>
          <ul className="start-list">
            {workspace ? (
              <>
                {action('file.new')}
                {action('palette.files')}
              </>
            ) : (
              action('file.openFolder')
            )}
            {action('workspace.samples')}
          </ul>
        </section>

        {!workspace && recent.length > 0 && (
          <section>
            <h2>Recent</h2>
            <ul className="start-list">
              {recent.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    className="start-link"
                    onClick={() => void wb.openWorkspace(path)}
                  >
                    {basename(path) || path}
                  </button>
                  <span className="start-path">{path}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2>Help</h2>
          <ul className="start-list">
            {action('palette.commands')}
            {action('edit.insertComponent')}
            {action('help.shortcuts')}
            {action('help.syntax')}
          </ul>
        </section>
      </div>
    </div>
  );
}
