import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// Tauri expects a fixed port and does not want the screen cleared.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: { conditions: ['source', ...defaultClientConditions] },
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
  },
});
