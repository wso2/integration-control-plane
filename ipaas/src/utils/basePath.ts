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

// The console can be served under a path prefix (e.g. /integration-platform), set at build time
// through Vite's `base`. Router paths stay prefix-free; only code that reads or
// builds window-level URLs goes through these helpers.

/** The prefix without a trailing slash: '' at the root, '/integration-platform' under a prefix. */
export const basePath = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** An app path (starting with '/') as a window-level path. */
export function withBase(path: string): string {
  return `${basePath}${path}`;
}

/** A window-level pathname as an app path; paths outside the prefix are returned unchanged. */
export function stripBase(pathname: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
}
