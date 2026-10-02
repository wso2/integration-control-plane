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
 * Cloud BFF client.
 *
 * Wraps authenticatedFetch (Bearer token via tokenManager) against the
 * ipaas-service base URL (window.API_CONFIG.choreoBaseApiUrl). PATCH is
 * supported here because the shared HttpClient lacks it.
 */

import { authenticatedFetch } from '#auth';

// Token-scope 403 retry helpers are product-agnostic shared HTTP infra; they
// live alongside the base HTTP clients in wip/. Re-exported so cloud domain
// files can wrap scope-sensitive BFF calls without reaching across folders.
export { withStsRetry, withScopeRetry } from '../wip/httpClients';

// Observability client (window.API_CONFIG.observabilityUrl). In the cloud
// deployment that URL points at the wso2cloud observability proxy, which logs
// and metrics are queried from directly rather than through the BFF.
export { obsClient } from '../wip/httpClients';

/** Standard BFF list envelope: { items: T[] }. */
export interface ListResponse<T> {
  items: T[];
}

/** Standard BFF mutation envelope returning a server message. */
export interface MessageResponse {
  message?: string;
}

/** Unwraps a ListResponse to its items array, tolerating null/undefined. */
export const items = <T>(r: ListResponse<T> | null | undefined): T[] => r?.items ?? [];

const bffBaseUrl = (): string => window.API_CONFIG?.choreoBaseApiUrl ?? '';

/** Pulls the user-facing sentence out of the BFF's `{ error, message }` envelope. */
function readableMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    const message = parsed?.message || parsed?.error;
    if (message) return message;
  } catch {
    // Not JSON (a gateway or proxy error) — fall through to the raw body.
  }
  return `HTTP ${status}: ${body}`;
}

/** `message` is the BFF's wording and reaches alerts unchanged — branch on `status`/`body`, never parse it. */
export class BffError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(readableMessage(status, body));
    this.name = 'BffError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const init: RequestInit = {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  const res = await authenticatedFetch(`${bffBaseUrl()}${path}`, init);
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new BffError(res.status, text || res.statusText);
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

export const bff = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body, headers),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('PUT', path, body, headers),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('PATCH', path, body, headers),
  delete: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('DELETE', path, body, headers),
};

/** Build a "?k=v&k=v" string from a record, dropping undefined/null/empty values. */
export function q(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Encode a single URL path segment. */
export const seg = (s: string): string => encodeURIComponent(s);
