/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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
import { defineConfig } from 'vitest/config';

// Standalone from vite.config.ts: unit tests are not a product build, so they
// always resolve #api/#product against `wip` — the reference implementation
// (see tsconfig.app.json) — regardless of which PRODUCT a dev/build session
// targets.
export default defineConfig({
  define: {
    __PRODUCT__: JSON.stringify('wip'),
  },
  resolve: {
    alias: {
      '#api': path.resolve(__dirname, 'src/api/wip'),
      '#product': path.resolve(__dirname, 'src/product/wip'),
    },
  },
  test: {
    // jsdom (not 'node'): src/config/runtimeConfig.ts reads `window` at module
    // scope, and future component/hook tests will need a DOM. Pin the origin
    // so window.location.origin-derived defaults are deterministic.
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'https://app.test' } },
    include: ['src/**/*.test.{ts,tsx}'],
    // No global test API injection — test files import describe/it/expect
    // from 'vitest' explicitly, same as every other import in this codebase.
    globals: false,
  },
});
