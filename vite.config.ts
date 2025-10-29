import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/rewrite': {
        target: 'https://groundstandard.app.n8n.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/rewrite/, '/webhook/rewrite'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
