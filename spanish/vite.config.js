import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/spanish/',
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/spanish/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/spanish/, ''),
      },
    },
  },
});
