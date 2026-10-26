import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5180,
    open: true,
    // Agent 服务在 8787，前端只管调 /api
    proxy: { '/api': 'http://localhost:8787' },
  },
});
