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
 * Transport for the workflow Management API.
 *
 * Deliberately raw `fetch`, not the BFF client (`src/api/_client.ts`): the API is the integration's
 * own, reached through the API Platform gateway with the endpoint's test key, and
 * `authenticatedFetch` would add the console's bearer token, which the API does not take (see
 * `connection/workflowCredential.ts`). The client sets the key on each request.
 */

export type WorkflowErrorCode = 'NOT_FOUND' | 'ACCESS_DENIED' | 'INVALID_REQUEST' | 'CONFLICT' | 'INVALID_PAYLOAD' | 'EXECUTION_ERROR' | 'GATEWAY_REJECTED' | 'NETWORK' | 'UNEXPECTED';

const DEFAULT_MESSAGE: Record<WorkflowErrorCode, string> = {
  NOT_FOUND: 'The workflow engine could not find what was requested.',
  ACCESS_DENIED: 'The workflow engine refused this request.',
  INVALID_REQUEST: 'The workflow engine rejected this request as invalid.',
  CONFLICT: 'That is not possible in the workflow’s current state.',
  INVALID_PAYLOAD: 'The workflow engine rejected the submitted value.',
  EXECUTION_ERROR: 'The workflow engine failed to handle this request.',
  GATEWAY_REJECTED: 'The gateway rejected the test key. It may have expired.',
  // In a browser a blocked CORS preflight is indistinguishable from being offline. The gateway in
  // front of the integration answers preflights itself, so what is left to name is the API not
  // being enabled or the integration not being reachable at all.
  NETWORK: 'Could not reach the workflow engine. If the integration is deployed, check that its management API is enabled and that the gateway allows requests from the console.',
  UNEXPECTED: 'The workflow engine returned an unexpected response.',
};

const CODE_BY_STATUS: Record<number, WorkflowErrorCode> = {
  400: 'INVALID_REQUEST',
  // The gateway refusing the test key, or the engine refusing the caller's token.
  401: 'GATEWAY_REJECTED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'INVALID_PAYLOAD',
  500: 'EXECUTION_ERROR',
};

export class WorkflowApiError extends Error {
  readonly code: WorkflowErrorCode;

  readonly status: number;

  /** The engine's own `{"error":{"message"}}` text, kept verbatim. */
  readonly serverMessage: string | null;

  readonly route: string;

  constructor(code: WorkflowErrorCode, status: number, serverMessage: string | null, route: string) {
    super(serverMessage || DEFAULT_MESSAGE[code]);
    this.name = 'WorkflowApiError';
    this.code = code;
    this.status = status;
    this.serverMessage = serverMessage;
    this.route = route;
  }
}

/** Whether `error` is the management API answering with `code`. */
export function isWorkflowError(error: unknown, code: WorkflowErrorCode): error is WorkflowApiError {
  return error instanceof WorkflowApiError && error.code === code;
}

/**
 * A query's `retry` for management API reads. An answer the engine or the gateway gave on purpose
 * (any 4xx) reads the same the second time, so only an unreachable engine or a server failure is
 * tried again, and at most twice.
 */
export function retryWorkflowRead(failureCount: number, error: Error): boolean {
  if (error instanceof WorkflowApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/** Drops `undefined`/`null`/`''` so they aren't sent as literal query values. */
export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

function extractServerMessage(text: string): string | null {
  if (!text) {
    return null;
  }
  try {
    const body = JSON.parse(text);
    const message = body?.error?.message ?? body?.message;
    return typeof message === 'string' && message ? message : null;
  } catch {
    return null;
  }
}

export interface WorkflowRequestInit {
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: unknown;
}

/**
 * Performs one call and returns the parsed body. A 204 or an empty body reads as `null`, which is
 * a legitimate answer from several routes.
 */
export async function workflowFetch<T>(url: string, { method = 'GET', headers, body }: WorkflowRequestInit): Promise<T> {
  const route = `${method} ${url}`;
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // A connection that drops mid-body fails here, not in fetch.
    text = await response.text();
  } catch {
    throw new WorkflowApiError('NETWORK', 0, null, route);
  }

  if (!response.ok) {
    throw new WorkflowApiError(CODE_BY_STATUS[response.status] ?? 'UNEXPECTED', response.status, extractServerMessage(text), route);
  }

  if (!text) {
    return null as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new WorkflowApiError('UNEXPECTED', response.status, null, route);
  }
}
