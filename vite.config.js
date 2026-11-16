import { globSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: ['index.html', 'design-system/index.html', ...globSync('topics/*/index.html').sort()],
    },
  },
});
