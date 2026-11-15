import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/mongo.global-setup.ts'],
    setupFiles: ['./test/mongo.setup.ts'],
    // Flows such as 10 failed logins run many scrypt hashes (N=2^17), which
    // can take well over the 5s default on slower CI runners.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
