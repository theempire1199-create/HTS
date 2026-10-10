import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  server: {
    port: 5173,
    // Use a concrete host, NOT `true`. A wildcard host makes Vite enumerate
    // network interfaces to print LAN URLs, which crashes on Android 11+ /
    // Termux: os.networkInterfaces() -> ERR_SYSTEM_ERROR (errno 13).
    // For LAN access on Android, run `npm run dev:android` instead.
    host: '127.0.0.1',
  },
})