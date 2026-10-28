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

/** What `useAuth()` returns. */
export interface AuthContextValue {
  isAuthenticated: boolean;
  userId: string;
  username: string;
  displayName: string;
  pictureUrl?: string;
  /** The organization the session is scoped to, chosen at sign-in. Empty when signed out. */
  orgHandle: string;
  loginWithOIDC: (fidp?: string) => Promise<void>;
  /**
   * Finishes sign-in on /signin from the query the IdP returned. Throws with a
   * message for the user when sign-in did not succeed.
   */
  completeSignIn: (params: URLSearchParams) => Promise<{ userId: string; orgHandle: string }>;
  logout: () => Promise<void>;
}
