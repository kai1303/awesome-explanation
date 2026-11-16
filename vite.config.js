import { globSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: ['index.html', ...globSync('topics/*/index.html').sort()],
    },
  },
});
