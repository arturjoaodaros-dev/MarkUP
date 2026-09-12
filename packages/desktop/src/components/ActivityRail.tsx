import { Files, Search, Settings as SettingsIcon } from 'lucide-react';
import { useAppStore } from '../state/appStore';

/**
 * Tira de ícones funcionais — cada um faz alguma coisa real, nada
 * decorativo (missão §21). Explorer/Busca ficam no topo; Configurações fica
 * fixo embaixo (convenção comum em rails de atividade) e não depende de
 * workspace aberto — tema e preferências fazem sentido mesmo sem pasta.
 */
export function ActivityRail() {
  const isSidebarCollapsed = useAppStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const isSettingsOpen = useAppStore((s) => s.isSettingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  return (
    <div className="mkd-activity-rail">
      <button
        className="mkd-activity-button"
        data-active={!isSidebarCollapsed}
        title="Explorer"
        onClick={toggleSidebar}
      >
        <Files size={18} />
      </button>
      <button className="mkd-activity-button" title="Buscar (Ctrl+Shift+F)" onClick={() => setSearchOpen(true)}>
        <Search size={18} />
      </button>
      <button
        className="mkd-activity-button mkd-activity-button-bottom"
        data-active={isSettingsOpen}
        title="Configurações"
        onClick={() => setSettingsOpen(true)}
      >
        <SettingsIcon size={18} />
      </button>
    </div>
  );
}
