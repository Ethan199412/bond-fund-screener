import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React 源码在 public/ 目录下；开发时 Vite 起前端并代理 /api 到后端 server.js（端口 3210）。
export default defineConfig({
  root: 'public',
  publicDir: false,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3210',
    },
  },
  build: {
    outDir: 'dist', // 相对 root => public/dist，由 server.js 托管
    emptyOutDir: true,
  },
});
