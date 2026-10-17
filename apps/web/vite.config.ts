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
    // Playwright writes screenshots, traces and reports under these directories
    // during E2E runs. Without this exclusion the dev server treats those
    // writes as source changes and hot-reloads the app mid-test, wiping
    // in-progress form state.
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**', '**/blob-report/**'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
      },
    },
  },
  preview: {
    // E2E runs against the production bundle (`vite preview`): no file
    // watcher, no HMR reloads, no StrictMode double-mounts — deterministic.
    // Port/host come from the CLI (`--port 5174 --strictPort --host ...`).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
      },
    },
  },
});
