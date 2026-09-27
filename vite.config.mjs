import { defineConfig } from 'vite'

// 仅用于开发时的热更新；正式构建仍由 cargo 直接嵌入 ../ui 静态文件，
// 不要用 vite build 的产物打包。
export default defineConfig({
  root: 'ui',
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
  },
})
