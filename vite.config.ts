import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const gatewayTarget = process.env.GATEWAY_PROXY_TARGET || 'http://127.0.0.1:3002';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: 'localhost', port: 3001, strictPort: true,
    proxy: {
      '/api/speech': { target: gatewayTarget, ws: true, changeOrigin: true },
      '/api/ai': { target: gatewayTarget, changeOrigin: true },
      '/api/topics': { target: gatewayTarget, changeOrigin: true },
      '/api/admin': { target: gatewayTarget, changeOrigin: true },
      '/api/operations/events': { target: gatewayTarget, changeOrigin: true },
    },
    ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
  },
  plugins: [vinext()],
});
