import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

const isDev = process.env.NODE_ENV !== 'production'

export default defineConfig(({ command }) => ({
  base: '/Age-of-Discovery/',
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react(
      isDev ? { babel: { plugins: ['react-dev-locator'] } } : {}
    ),
    tsconfigPaths()
  ],
}))
