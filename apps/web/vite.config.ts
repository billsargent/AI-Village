import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev proxy to apps/server's own dev listener (spec section 3: two
// separate processes, server and web), so the browser only ever talks to
// one origin and there's no CORS dance.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Serves the repo's art/src (spec section 10) as static files at the
  // site root, e.g. art/src/tiles/foo.png -> /tiles/foo.png.
  publicDir: fileURLToPath(new URL('../../art/src', import.meta.url)),
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
