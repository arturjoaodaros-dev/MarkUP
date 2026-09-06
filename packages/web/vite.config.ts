import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    name: '@markup/web',
    environment: 'jsdom',
    globals: true,
  },
});
