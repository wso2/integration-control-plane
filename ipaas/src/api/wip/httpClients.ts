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

import { authenticatedFetch, getOrgUuidFromToken, refreshAccessToken } from '#auth';
import { HttpError } from '../../types/http';

export interface HttpClient {
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  delete: <T>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
}

interface HttpClientOptions {
  /** Called when a 403 is received.
   * true - retry the original request,
   * false - fall through to the standard error throw */
  on403?: (res: Response) => Promise<boolean>;
  /** Return the raw text when a 2xx body isn't JSON (e.g. a plain "OK" from DELETE/PUT).
   * Off by default — unexpected non-JSON bodies throw. */
  tolerateNonJson?: boolean;
}

// Factory to create HTTP clients for different services
export function createHttpClient(getBaseUrl: () => string, clientOptions?: HttpClientOptions): HttpClient {
  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${getBaseUrl()}${path}`;
    const init: RequestInit = {
      ...options,
      headers: {
        ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options?.headers,
      },
    };

    let res = await authenticatedFetch(url, init);

    if (res.status === 403 && clientOptions?.on403) {
      const shouldRetry = await clientOptions.on403(res);
      if (shouldRetry) {
        res = await authenticatedFetch(url, init);
      }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new HttpError(res.status, `HTTP ${res.status}: ${body || res.statusText}`);
    }
    const text = await res.text().catch(() => '');
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      // Opt-in clients (e.g. platform services) accept a plain "OK" from DELETE/PUT; others stay strict.
      if (clientOptions?.tolerateNonJson) return text as unknown as T;
      throw err instanceof Error ? err : new Error('Expected a JSON response body.');
    }
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers }),
    put: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'PUT', ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers }),
    patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'PATCH', ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers }),
    delete: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>(path, { method: 'DELETE', ...(body !== undefined ? { body: JSON.stringify(body) } : {}), headers }),
  };
}

// HTTP Clients

// Local IS — credential login/session + credential-account operations (reset password,
// unlock, force-change, per-user permission resolution). Points at VITE_AUTH_BASE_URL.
export const authClient = createHttpClient(() => window.API_CONFIG.authBaseUrl);

// Shared gateway user-mgt service — org member/role/group data (same backend as Devant).
export const userMgtClient = createHttpClient(() => `${window.API_CONFIG.choreoBaseApiUrl}/user-mgt/1.0.0`);

// System APIs — task execution logs, build logs, observability
export const systemClient = createHttpClient(() => {
  const base = window.API_CONFIG?.systemApisBaseUrl;
  if (!base) throw new Error('System APIs base URL is not configured');
  return base;
});

// APIM Publisher — API lifecycle, throttling, swagger
export const apimClient = createHttpClient(() => window.API_CONFIG.apimBaseUrl);

// Observability — metrics and runtime logs
export const obsClient = createHttpClient(() => {
  const base = window.API_CONFIG?.observabilityUrl;
  if (!base) throw new Error('Observability URL is not configured');
  return base;
});

// Choreo Platform API — single client for all choreoBaseApiUrl services
export const choreoClient = createHttpClient(() => window.API_CONFIG.choreoBaseApiUrl);

// Same base, but tolerant of plain-text bodies (e.g. a "OK" from some DELETE endpoints).
export const choreoTextClient = createHttpClient(() => window.API_CONFIG.choreoBaseApiUrl, { tolerateNonJson: true });
// Same base, but tolerates a plain-text body (e.g. connections DELETE returns "successful").
export const choreoClientTolerant = createHttpClient(() => window.API_CONFIG.choreoBaseApiUrl, { tolerateNonJson: true });

// Choreo URL-manager — custom domains + URL mappings (custom domain feature).
export const urlManagerClient = createHttpClient(() => {
  const base = window.API_CONFIG?.urlManagerUrl;
  if (!base) throw new Error('URL manager base URL is not configured');
  return base;
});

// Subscriptions service
export const subscriptionsClient = createHttpClient(() => window.API_CONFIG.subscriptionsApiUrl);

// Platform services — managed databases (admin "Databases" feature).
export const platformServicesClient = createHttpClient(
  () => {
    const base = window.API_CONFIG?.platformServicesApiBaseUrl;
    if (!base) throw new Error('Platform services base URL is not configured');
    return base;
  },
  { tolerateNonJson: true },
);

// RAG backend — powers the Retrieval query endpoint.
export const ragBackendClient = createHttpClient(() => {
  const base = window.API_CONFIG?.ragBackendUrl;
  if (!base) throw new Error('RAG backend base URL is not configured');
  return base;
});

// Choreo Insights — GraphQL-like query endpoint on a separate host
export const insightsClient = createHttpClient(() => `${window.API_CONFIG.insightsBaseUrl}/insights/1.0.0`);

// AI Copilot data collector — feedback, data collection permissions
export const copilotDatacollectorClient = createHttpClient(() => {
  const base = window.API_CONFIG?.aiCopilotDatacollectorBaseUrl;
  if (!base) throw new Error('Copilot datacollector URL is not configured');
  return base;
});

// Governance — org-level rulesets, documents, and governance policies (same backend as Devant).
export const governanceClient = createHttpClient(() => `${window.API_CONFIG.choreoBaseApiUrl}/governance/v1.0`);

// Ruleset content is raw YAML/JSON text, not a JSON document.
export const governanceTextClient = createHttpClient(() => `${window.API_CONFIG.choreoBaseApiUrl}/governance/v1.0`, { tolerateNonJson: true });

// Retry helpers — exported so api/ files can wrap specific calls without importing tokenManager directly.

// On 403: if STS is configured and the token carries no org UUID (unscoped), refresh once and retry.
export async function withStsRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const stsConfigured = !!window.API_CONFIG.stsTokenEndpoint && !!window.API_CONFIG.stsClientId;
    if (err instanceof Error && err.message.startsWith('HTTP 403') && stsConfigured && !getOrgUuidFromToken()) {
      await refreshAccessToken();
      return fn();
    }
    throw err;
  }
}

// On 403: parse the error body (embedded in the thrown message) to detect an APIM scope error
// (code 900910 / "Scope validation"); if found, refresh the token and retry once.
export async function withScopeRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('HTTP 403')) {
      const body = err.message.replace(/^HTTP 403: /, '');
      let isScopeError = false;
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        isScopeError = parsed?.code === '900910' || String(parsed?.error_description ?? '').includes('Scope validation');
      } catch {
        /* not JSON */
      }
      if (isScopeError) {
        await refreshAccessToken();
        return fn();
      }
    }
    throw err;
  }
}
