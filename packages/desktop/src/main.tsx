import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/app.css';
import './styles/editor.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { fs } from './fs/index.ts';
import { loadSettings, resolvedTheme } from './state/settings.ts';
import { initialState, Store } from './state/store.ts';
import { Workbench } from './state/workbench.ts';

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const settings = loadSettings(storage());
document.documentElement.dataset.theme = resolvedTheme(settings);
const workbench = new Workbench(new Store(initialState(settings)), fs, storage());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App wb={workbench} />
  </StrictMode>,
);
