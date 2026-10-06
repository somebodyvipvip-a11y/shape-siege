import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: { __APP_VERSION__: JSON.stringify(readFileSync(new URL('./VERSION', import.meta.url), 'utf8').trim()) },
});
