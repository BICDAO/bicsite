import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // .mjs as well as .ts: src/lib/migration.mjs is plain JavaScript so its
    // suite can stay build-step-free, and it came across from DeVamp intact.
    include: ['tests/int/**/*.int.spec.{ts,mjs}'],
  },
})
