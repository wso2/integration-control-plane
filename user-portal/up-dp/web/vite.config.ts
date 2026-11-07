import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// UP-DP sits behind the gateway, which owns /api and /config.js; in development the dev server passes
// them to the mock gateway, so the SPA keeps one origin.
const gateway = process.env.UP_DP_URL ?? 'http://localhost:9200';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': { target: gateway, changeOrigin: false },
      '/config.js': { target: gateway, changeOrigin: false },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('oxygen-ui-icons-react')) return 'icons';
          if (id.includes('@wso2/oxygen-ui') || id.includes('@mui') || id.includes('@emotion')) return 'oxygen';
          // React alone, so this chunk imports no other chunk and the chunks can't form a cycle.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
        },
      },
    },
  },
  plugins: [react()],
});
