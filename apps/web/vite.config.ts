import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The SPA and the API are served from the same origin in production (Nginx
// reverse proxy). In development the proxy below forwards /api to the API so
// the browser only ever talks to one origin, which keeps cookie-based auth
// simple and avoids a permissive CORS configuration.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
      },
    },
  },
});
