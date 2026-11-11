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

import { authenticatedFetch } from '../auth';
import { HttpError } from '../types/http';

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

// The BFF's coded error fields, parsed from the body once. `code` is stable across releases, so
// callers branch on it rather than on message text; the environments name where a refused change
// has to be made instead.
interface BffErrorDetail {
  code?: string;
  entryEnvironment?: string;
  sourceEnvironment?: string;
}

function errorDetail(body: string): BffErrorDetail {
  try {
    const parsed = JSON.parse(body) as BffErrorDetail | null;
    if (parsed && typeof parsed === 'object') return { code: parsed.code || undefined, entryEnvironment: parsed.entryEnvironment || undefined, sourceEnvironment: parsed.sourceEnvironment || undefined };
  } catch {
    // Not JSON — no code to read.
  }
  return {};
}

/** `message` is the BFF's wording and reaches alerts unchanged — branch on `status`/`body`, never parse it. */
export class BffError extends Error {
  readonly status: number;
  readonly body: string;
  readonly code?: string;
  readonly entryEnvironment?: string;
  readonly sourceEnvironment?: string;

  constructor(status: number, body: string) {
    super(readableMessage(status, body));
    this.name = 'BffError';
    this.status = status;
    this.body = body;
    Object.assign(this, errorDetail(body));
  }
}

async function request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  // A URLSearchParams body is sent form-encoded (fetch sets its content type); anything else as JSON.
  const form = body instanceof URLSearchParams;
  const init: RequestInit = {
    method,
    headers: {
      ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: form ? body : JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  };

  const res = await authenticatedFetch(`${bffBaseUrl()}${path}`, init);
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new BffError(res.status, text || res.statusText);
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

/**
 * A BFF route as an absolute URL, and a fetch that sends to it under the console's session: for a client that
 * makes its own requests to the BFF, such as the MCP SDK's transport on the Test page.
 */
export const bffAbsoluteUrl = (path: string): string => new URL(`${bffBaseUrl()}${path}`, window.location.origin).toString();
export const bffFetch = (input: string | URL, init?: RequestInit): Promise<Response> => authenticatedFetch(String(input), init);

export const bff = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>, signal?: AbortSignal) => request<T>('POST', path, body, headers, signal),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('PUT', path, body, headers),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('PATCH', path, body, headers),
  delete: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('DELETE', path, body, headers),
};

// Observability client (window.API_CONFIG.observabilityUrl). In the cloud
// deployment that URL points at the wso2cloud observability proxy, which logs
// and metrics are queried from directly rather than through the BFF. Errors
// carry the raw status and body, since the proxy has no BFF envelope.
async function obsPost<T>(path: string, body: unknown): Promise<T> {
  const base = window.API_CONFIG?.observabilityUrl;
  if (!base) throw new Error('Observability URL is not configured');
  const res = await authenticatedFetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}: ${text || res.statusText}`);
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

export const obsClient = {
  post: obsPost,
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
