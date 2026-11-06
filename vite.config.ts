import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

const isDev = process.env.NODE_ENV !== 'production'

export default defineConfig(() => ({
  base: '/Age-of-Discovery/',
  resolve: {
    // 用 Vite 内置正则 alias 解析 @/*（替代 vite-tsconfig-paths：
    // 该插件依赖 tsconfck 的路径大小写与本机盘符大小写一致，Windows 上会静默失效，
    // 导致所有 @/ 别名无法解析、构建在第一个 @/ 导入处中断）
    alias: [
      { find: /^@\/(.*)$/, replacement: `${srcDir}/$1` },
    ],
  },
  build: {
    /*
     * 发布体积实测：dist 115 MB，其中 22 个 .map 占了 29 MB。
     * 这是纯前端静态站点，没有服务端日志回溯，线上 source map 用不上；
     * 而 itch.io / CrazyGames 的初始下载体积是有硬门槛的。
     * 需要排查线上问题时临时改回 'hidden' 即可（开发模式不受影响）。
     */
    sourcemap: false,
  },
  plugins: [
    react(
      isDev ? { babel: { plugins: ['react-dev-locator'] } } : {}
    ),
  ],
}))
