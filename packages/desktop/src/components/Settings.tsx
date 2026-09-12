import { useEffect, useState, type ReactNode } from 'react';
import { Eye, FileText, Monitor, Moon, Palette, Save, SquareCode, Sun, X } from 'lucide-react';
import { useAppStore } from '../state/appStore';
import type { FilesSettings, MarkupSettings, PreviewSettings, ThemePreference } from '../fs/settings';

const CATEGORIES = [
  { id: 'aparencia', label: 'Aparência', icon: Palette },
  { id: 'editor', label: 'Editor', icon: SquareCode },
  { id: 'preview', label: 'Preview', icon: Eye },
  { id: 'arquivos', label: 'Arquivos', icon: Save },
  { id: 'markup', label: 'MarkUP', icon: FileText },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

const FONT_FAMILY_OPTIONS = [
  { value: 'var(--font-mono)', label: 'Padrão (Cascadia Code)' },
  { value: "'JetBrains Mono', Consolas, ui-monospace, monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', Consolas, ui-monospace, monospace", label: 'Fira Code' },
  { value: 'Consolas, ui-monospace, monospace', label: 'Consolas' },
  { value: "'Courier New', ui-monospace, monospace", label: 'Courier New' },
];

/**
 * Painel de Configurações (missão desta etapa) — mesmo vocabulário visual
 * dos outros overlays (backdrop + painel elevado), mas maior e com
 * navegação lateral por categoria em vez de lista/busca. Cada controle lê e
 * grava direto no store (`updateEditorSettings` etc.) — que já persiste via
 * `@tauri-apps/plugin-store` (ver `fs/settings.ts`), então não existe estado
 * local aqui além de "qual categoria está selecionada".
 */
export function Settings() {
  const isOpen = useAppStore((s) => s.isSettingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const [category, setCategory] = useState<CategoryId>('aparencia');

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, setOpen]);

  if (!isOpen) return null;

  const activeCategory = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  return (
    <div className="mkd-overlay-backdrop mkd-overlay-backdrop-center" onClick={() => setOpen(false)}>
      <div className="mkd-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mkd-settings-nav">
          <div className="mkd-settings-nav-header">Configurações</div>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                className="mkd-settings-nav-item"
                data-active={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                <Icon size={15} />
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mkd-settings-content">
          <div className="mkd-settings-content-header">
            <h2>{activeCategory.label}</h2>
            <button className="mkd-sidebar-action" title="Fechar (Esc)" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="mkd-settings-body">
            {category === 'aparencia' && <AparenciaSection />}
            {category === 'editor' && <EditorSection />}
            {category === 'preview' && <PreviewSection />}
            {category === 'arquivos' && <ArquivosSection />}
            {category === 'markup' && <MarkupSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, description, control }: { label: string; description?: string; control: ReactNode }) {
  return (
    <div className="mkd-setting-row">
      <div className="mkd-setting-row-text">
        <span className="mkd-setting-label">{label}</span>
        {description && <span className="mkd-setting-desc">{description}</span>}
      </div>
      {control}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className="mkd-toggle"
      data-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="mkd-toggle-knob" />
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return <SettingRow label={label} description={description} control={<Toggle checked={checked} onChange={onChange} />} />;
}

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      control={
        <select className="mkd-select" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      }
    />
  );
}

function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <SettingRow
      label={label}
      description={description}
      control={
        <div className="mkd-slider-control">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="mkd-slider-value">
            {value}
            {unit}
          </span>
        </div>
      }
    />
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

function AparenciaSection() {
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);

  return (
    <SettingRow
      label="Tema"
      description='"Sistema" acompanha a preferência de tema do Windows automaticamente, sem precisar reiniciar o app.'
      control={
        <div className="mkd-segmented">
          {THEME_OPTIONS.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.value}
                className="mkd-segmented-button"
                data-active={themePreference === o.value}
                onClick={() => setThemePreference(o.value)}
              >
                <Icon size={14} />
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      }
    />
  );
}

function EditorSection() {
  const editor = useAppStore((s) => s.settings.editor);
  const update = useAppStore((s) => s.updateEditorSettings);

  return (
    <>
      <SliderRow
        label="Tamanho da fonte"
        value={editor.fontSize}
        min={11}
        max={22}
        step={1}
        unit="px"
        onChange={(v) => update({ fontSize: v })}
      />
      <SelectRow
        label="Família da fonte"
        value={editor.fontFamily}
        options={FONT_FAMILY_OPTIONS}
        onChange={(v) => update({ fontFamily: v })}
      />
      <SelectRow
        label="Tamanho do tab"
        description="Também define a indentação — sempre por espaços, nunca caractere de tabulação."
        value={String(editor.tabSize)}
        options={[
          { value: '2', label: '2 espaços' },
          { value: '4', label: '4 espaços' },
          { value: '8', label: '8 espaços' },
        ]}
        onChange={(v) => update({ tabSize: Number(v) })}
      />
      <ToggleRow
        label="Quebra de linha automática"
        description="Quando desligado, linhas longas rolam horizontalmente em vez de quebrar."
        checked={editor.wordWrap}
        onChange={(v) => update({ wordWrap: v })}
      />
      <ToggleRow label="Números de linha" checked={editor.lineNumbers} onChange={(v) => update({ lineNumbers: v })} />
      <ToggleRow
        label="Limitar largura da área de edição"
        description="Centraliza o texto numa coluna de leitura em vez de usar a largura toda do painel."
        checked={editor.maxWidth !== null}
        onChange={(v) => update({ maxWidth: v ? 800 : null })}
      />
      {editor.maxWidth !== null && (
        <SliderRow
          label="Largura máxima"
          value={editor.maxWidth}
          min={480}
          max={1400}
          step={20}
          unit="px"
          onChange={(v) => update({ maxWidth: v })}
        />
      )}
    </>
  );
}

function PreviewSection() {
  const preview = useAppStore((s) => s.settings.preview);
  const update = useAppStore((s) => s.updatePreviewSettings);

  return (
    <>
      <SelectRow
        label="Modo de atualização"
        description="Controla quando o preview reflete as edições do documento aberto."
        value={preview.updateMode}
        options={[
          { value: 'live', label: 'Ao vivo (a cada tecla)' },
          { value: 'onSave', label: 'Ao salvar' },
          { value: 'manual', label: 'Manual (botão atualizar)' },
        ]}
        onChange={(v) => update({ updateMode: v as PreviewSettings['updateMode'] })}
      />
      <SelectRow
        label="Abertura do preview"
        description="Aplica-se na próxima vez que o MarkUP abrir."
        value={preview.openBehavior}
        options={[
          { value: 'always', label: 'Sempre aberto' },
          { value: 'closed', label: 'Sempre fechado' },
          { value: 'remember', label: 'Lembrar do último estado' },
        ]}
        onChange={(v) => update({ openBehavior: v as PreviewSettings['openBehavior'] })}
      />
      <ToggleRow
        label="Limitar largura do conteúdo"
        description="Centraliza o documento renderizado em vez de usar a largura toda do painel."
        checked={preview.maxWidth !== null}
        onChange={(v) => update({ maxWidth: v ? 720 : null })}
      />
      {preview.maxWidth !== null && (
        <SliderRow
          label="Largura máxima"
          value={preview.maxWidth}
          min={480}
          max={1400}
          step={20}
          unit="px"
          onChange={(v) => update({ maxWidth: v })}
        />
      )}
    </>
  );
}

function ArquivosSection() {
  const files = useAppStore((s) => s.settings.files);
  const update = useAppStore((s) => s.updateFilesSettings);

  return (
    <>
      <SelectRow
        label="Salvamento automático"
        value={files.autoSave}
        options={[
          { value: 'off', label: 'Desligado' },
          { value: 'delayed', label: 'Após atraso' },
          { value: 'on', label: 'Ligado' },
        ]}
        onChange={(v) => update({ autoSave: v as FilesSettings['autoSave'] })}
      />
      {files.autoSave === 'delayed' && (
        <SliderRow
          label="Intervalo do autosave"
          value={files.autoSaveIntervalSeconds}
          min={1}
          max={60}
          step={1}
          unit="s"
          onChange={(v) => update({ autoSaveIntervalSeconds: v })}
        />
      )}
      <ToggleRow
        label="Confirmar antes de fechar com alterações"
        checked={files.confirmBeforeClosingDirty}
        onChange={(v) => update({ confirmBeforeClosingDirty: v })}
      />
      <ToggleRow
        label="Restaurar abas da última sessão"
        description="Reabre os mesmos documentos ao iniciar o MarkUP na mesma pasta."
        checked={files.restoreLastSession}
        onChange={(v) => update({ restoreLastSession: v })}
      />
    </>
  );
}

function MarkupSection() {
  const markup = useAppStore((s) => s.settings.markup);
  const update = useAppStore((s) => s.updateMarkupSettings);
  const alternate = markup.defaultExtension === '.markup' ? '.mkup' : '.markup';

  return (
    <>
      <SelectRow
        label="Extensão padrão"
        description="Usada ao criar um novo documento sem digitar a extensão."
        value={markup.defaultExtension}
        options={[
          { value: '.markup', label: '.markup' },
          { value: '.mkup', label: '.mkup' },
        ]}
        onChange={(v) => update({ defaultExtension: v as MarkupSettings['defaultExtension'] })}
      />
      <SettingRow
        label="Extensão alternativa reconhecida"
        description={`Arquivos ${alternate} também são abertos e indexados como documentos MarkUP, independente da extensão padrão acima.`}
        control={<span className="mkd-setting-static-value">{alternate}</span>}
      />
    </>
  );
}
