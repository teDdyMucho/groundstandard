import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/research': {
        target: 'https://primary-production-a010.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/research/, '/webhook/research'),
      },
      '/api/write': {
        target: 'https://primary-production-a010.up.railway.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/write/, '/webhook/write'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
