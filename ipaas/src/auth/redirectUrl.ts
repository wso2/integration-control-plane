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

// Where to send the user after sign-in. Not auth: both products save it before
// leaving for the IdP and read it back on /signin.

const REDIRECT_URL_KEY = 'redirect_url';

export function saveRedirectUrl(url: string): void {
  // Never persist a redirect to the synthetic 'default' org — it isn't real and
  // would loop back there on every subsequent login.
  try {
    const pathname = new URL(url).pathname;
    if (pathname.startsWith('/organizations/default/') || pathname === '/organizations/default') return;
  } catch {
    /* ignore malformed URLs */
  }
  localStorage.setItem(REDIRECT_URL_KEY, url);
}

export function getAndClearRedirectUrl(): string | null {
  const url = localStorage.getItem(REDIRECT_URL_KEY);
  localStorage.removeItem(REDIRECT_URL_KEY);
  return url;
}
