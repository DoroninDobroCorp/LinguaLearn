import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.SPANISH_API_PROXY_TARGET || 'http://localhost:3003';

export default defineConfig({
  base: '/spanish/',
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/spanish/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/spanish/, ''),
      },
    },
  },
});
