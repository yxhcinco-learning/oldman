import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: 'localhost', port: 3001, strictPort: true,
    proxy: {
      '/api/speech': { target: 'http://127.0.0.1:3002', ws: true, changeOrigin: true },
      '/api/ai': { target: 'http://127.0.0.1:3002', changeOrigin: true },
    },
    ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
  },
  plugins: [vinext()],
});
