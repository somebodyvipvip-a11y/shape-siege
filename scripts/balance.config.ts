import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/balance.replay.ts'], testTimeout: 120000 } });
