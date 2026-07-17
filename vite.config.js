import { defineConfig } from 'vite';

// Vite 開發設定 -------------------------------------------------
export default defineConfig({
  root: '.',
  base: './',
  server: {
    port: 5173,
    open: true,   // 啟動時自動開啟瀏覽器
    host: true,   // 允許區網其他裝置連入測試
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
  },
});
