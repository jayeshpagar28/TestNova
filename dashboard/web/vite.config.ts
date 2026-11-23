import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: listen on the LAN as well as localhost. allowedHosts: accept requests arriving through a
  // Cloudflare quick tunnel (https://<random>.trycloudflare.com), used to share the prototype.
  server: {
    // TESTNOVA_WEB_PORT moves the page (e.g. when another dashboard already holds 5180); strictPort:
    // fail instead of silently moving to the next free port, which would hide the conflict.
    port: Number(process.env.TESTNOVA_WEB_PORT ?? 5180),
    strictPort: true,
    host: true,
    allowedHosts: ['.trycloudflare.com', '.loca.lt'],
    // xfwd: the API tells this PC from a colleague on the LAN by the forwarded client address.
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.TESTNOVA_PORT ?? 5181}`, xfwd: true } },
  },
});
