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
      '/api/research': {
        target: 'https://groundstandard.app.n8n.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/research/, '/webhook/Research'),
      },
      '/api/write': {
        target: 'https://groundstandard.app.n8n.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/write/, '/webhook/Write'),
      },
      '/api/tag': {
        target: 'https://groundstandard.app.n8n.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/tag/, '/webhook/Tag'),
      },
      '/api/chat-bot': {
        target: 'https://groundstandard.app.n8n.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/chat-bot/, '/webhook/chat-bot'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
