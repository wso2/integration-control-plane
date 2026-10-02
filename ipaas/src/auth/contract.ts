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

/**
 * Auth contract — everything app code may import from `#auth`.
 *
 * Vite resolves `#auth` per product: `cloud` → `auth/cloud/`, `wip` and `icp`
 * → `auth/wip/`. Each folder has a `_check.ts` that asserts its exports satisfy
 * {@link AuthModule}, so drift between the two becomes a TypeScript error.
 *
 * Types only. The two implementations share no logic — only this shape. The
 * helpers in `shared/` are not auth and are re-exported by both.
 *
 * Code under `auth/` imports `auth/cloud/` or `auth/wip/` directly; nothing
 * outside `auth/` does.
 */

import type { JSX, ReactNode } from 'react';

export interface AuthContextValue {
  isAuthenticated: boolean;
  userId: string;
  username: string;
  displayName: string;
  pictureUrl?: string;
  isOidcUser: boolean;
  requirePasswordChange: boolean;
  clearRequirePasswordChange: () => void;
  login: (username: string, password: string) => Promise<void>;
  loginWithOIDC: (fidp?: string) => Promise<void>;
  handleOIDCCallback: (code: string, state: string | null) => Promise<{ isNewUser: boolean }>;
  completeOrgRegistration: (orgHandle: string) => Promise<void>;
  logout: () => Promise<void>;
}

export interface AuthModule {
  AuthProvider: (props: { children: ReactNode }) => JSX.Element;
  useAuth: () => AuthContextValue;

  /** `fetch` with the Bearer token attached. */
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
  /** Async because the cloud token comes from the Thunder SDK, which only offers an async getter. */
  getAccessToken: () => Promise<string | null>;
  /** The org UUID in the current access token, or null when there is none. */
  getOrgUuidFromToken: () => string | null;
  /** Re-scopes the session to another org. Rejects when that isn't possible. */
  switchOrgToken: (orgHandle: string, signal?: AbortSignal) => Promise<void>;
  /** Checks the `state` returned to /signin against the one saved before sign-in. */
  validateAndClearOIDCState: (state: string) => boolean;

  // shared/ — not auth, re-exported so app code has one import path.
  saveRedirectUrl: (url: string) => void;
  getAndClearRedirectUrl: () => string | null;
  generateAndSaveGitHubState: () => string;
  validateAndClearGitHubState: (state: string) => boolean;
}
