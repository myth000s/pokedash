import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    // Each DB test boots PGlite and runs every migration; under a parallel full run that can pass 5 s.
    testTimeout: 15_000,
  },
});
