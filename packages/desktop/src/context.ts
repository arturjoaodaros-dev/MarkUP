import { createContext, useContext } from 'react';
import type { Command } from './state/commands.ts';
import { useStore, type State } from './state/store.ts';
import type { Workbench } from './state/workbench.ts';

export interface AppContext {
  wb: Workbench;
  commands: Command[];
}

export const WorkbenchContext = createContext<AppContext | null>(null);

export function useWorkbench(): AppContext {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error('useWorkbench must be used inside <WorkbenchContext.Provider>');
  return context;
}

export function useAppState<T>(selector: (state: State) => T): T {
  const { wb } = useWorkbench();
  return useStore(wb.store, selector);
}
