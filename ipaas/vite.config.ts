/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { visualizer } from 'rollup-plugin-visualizer';
import basicSsl from '@vitejs/plugin-basic-ssl';

type Product = 'wip' | 'cloud' | 'icp';
const ALLOWED_PRODUCTS: Product[] = ['wip', 'cloud', 'icp'];
const rawProduct = process.env.PRODUCT ?? 'wip';
if (!(ALLOWED_PRODUCTS as string[]).includes(rawProduct)) {
  throw new Error(`Invalid PRODUCT="${rawProduct}"; must be one of: ${ALLOWED_PRODUCTS.join(', ')}`);
}
const product = rawProduct as Product;
const authProduct = product === 'cloud' ? 'cloud' : 'wip';

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  define: {
    __PRODUCT__: JSON.stringify(product),
  },
  server: {
    port: 3000,
    https: {},
    proxy: {
      '/subscriptions-proxy': {
        target: 'https://subscriptions.dv.wso2.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/subscriptions-proxy/, ''),
      },
    },
  },
  // Preview mirrors the dev server: the IDP only accepts redirects on :3000, and
  // `vite preview` reads none of `server`, so port and proxy are repeated here.
  preview: {
    port: 3000,
    strictPort: true,
    https: {},
  },
  optimizeDeps: {
    // Pre-bundle so a lazy page importing it mid-session doesn't trigger a re-optimize reload.
    include: ['@wso2/oxygen-ui-charts-react'],
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: {
      '#api': path.resolve(__dirname, `src/api/${product}`),
      '#product': path.resolve(__dirname, `src/product/${product}`),
      '#auth': path.resolve(__dirname, `src/auth/${authProduct}`),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Rollup gives every module shared by two lazy routes its own chunk. With
        // icons imported across ~80 route modules that produced 43 single-icon
        // files, so one navigation spent ~2s on round-trips for ~35KB. Grouping
        // them costs a few unused icons per route and saves 40+ requests.
        manualChunks(id: string) {
          if (id.includes('oxygen-ui-icons-react')) return 'icons';
        },
      },
    },
  },
  plugins: [
    basicSsl(),
    react(),
    visualizer({
      open: false,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
});
