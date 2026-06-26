import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Dev mode: vite proxy → backend services (nginx production da)
      '/api/auth': 'http://localhost:8081',
      '/api/marketplace': 'http://localhost:8082',
      '/api/rec': 'http://localhost:8083',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
