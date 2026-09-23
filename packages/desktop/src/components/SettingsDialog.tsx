import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppState, useWorkbench } from '../context.ts';
import { formatShortcut } from '../lib/keys.ts';
import type { Settings } from '../state/settings.ts';

type Tab = 'general' | 'shortcuts';

export function SettingsDialog() {
  const open = useAppState((s) => s.settingsOpen);
  if (!open) return null;
  return <Dialog />;
}

function Dialog() {
  const { wb, commands } = useWorkbench();
  const settings = useAppState((s) => s.settings);
  const [tab, setTab] = useState<Tab>('general');
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => wb.store.set({ settingsOpen: false });
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => wb.updateSettings({ [key]: value } as Partial<Settings>);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button, select, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="overlay is-centered" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Settings" ref={dialog}>
        <header className="dialog-header">
          <div className="dialog-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'general'} onClick={() => setTab('general')}>
              Settings
            </button>
            <button type="button" role="tab" aria-selected={tab === 'shortcuts'} onClick={() => setTab('shortcuts')}>
              Keyboard shortcuts
            </button>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <div className="dialog-body">
          {tab === 'general' ? (
            <>
              <Section title="Appearance">
                <Row label="Theme" description="The color scheme of the app.">
                  <Segmented value={settings.theme} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]} onChange={(v) => set('theme', v)} />
                </Row>
                <Row label="Preview theme" description="Follow the app, or always render light or dark.">
                  <Segmented value={settings.previewTheme} options={[['app', 'Same as app'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(v) => set('previewTheme', v)} />
                </Row>
              </Section>
              <Section title="Editor">
                <Row label="Font size" description={`${settings.fontSize}px — also ${formatShortcut('mod+=')} and ${formatShortcut('mod+-')}.`}>
                  <input type="range" min={10} max={24} value={settings.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))} aria-label="Font size" />
                </Row>
                <Row label="Tab size">
                  <Segmented value={String(settings.tabSize)} options={[['2', '2'], ['4', '4'], ['8', '8']]} onChange={(v) => set('tabSize', Number(v))} />
                </Row>
                <Row label="Word wrap" description="Wrap long lines to the width of the editor.">
                  <Toggle checked={settings.wordWrap} onChange={(v) => set('wordWrap', v)} label="Word wrap" />
                </Row>
                <Row label="Line numbers">
                  <Toggle checked={settings.lineNumbers} onChange={(v) => set('lineNumbers', v)} label="Line numbers" />
                </Row>
              </Section>
              <Section title="Preview">
                <Row label="Scroll sync" description="Keep the editor and the preview scrolled to the same place.">
                  <Toggle checked={settings.scrollSync} onChange={(v) => set('scrollSync', v)} label="Scroll sync" />
                </Row>
              </Section>
              <Section title="Files">
                <Row label="Auto save" description="Save changes automatically after a short pause.">
                  <Segmented value={settings.autosave === 'afterDelay' ? 'afterDelay' : 'off'} options={[['off', 'Off'], ['afterDelay', 'After a pause']]} onChange={(v) => set('autosave', v)} />
                </Row>
              </Section>
            </>
          ) : (
            <table className="shortcuts">
              <tbody>
                {commands
                  .filter((c) => c.shortcuts?.length)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="muted">{c.category}:</span> {c.title}
                      </td>
                      <td>
                        {c.shortcuts!.map((s) => (
                          <kbd key={s}>{formatShortcut(s)}</kbd>
                        ))}
                      </td>
                    </tr>
                  ))}
                {[
                  ['Quick fix', 'mod+.'],
                  ['Go to definition', 'f12'],
                  ['Trigger suggestions', 'ctrl+space'],
                ].map(([label, key]) => (
                  <tr key={key}>
                    <td>
                      <span className="muted">Editor:</span> {label}
                    </td>
                    <td>
                      <kbd>{formatShortcut(key!)}</kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-label">{label}</div>
        {description && <div className="settings-description">{description}</div>}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="segmented is-labelled" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}
