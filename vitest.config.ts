import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  // Next's tsconfig sets jsx: 'preserve' for its own compiler, which leaves JSX in the
  // source and Vite's import analysis then cannot parse it. Override just for tests;
  // tsconfig.json itself must keep 'preserve' for the Next build.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
