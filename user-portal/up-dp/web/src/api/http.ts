/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import i18n from '../i18n';

/** An answer outside 2xx, or no answer (status 0), with the server's own message when it gave one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const FALLBACK_MESSAGES: Record<number, 'unreachable' | 'unauthorized' | 'forbidden' | 'notFound' | 'conflict' | 'unprocessable' | 'unavailable'> = {
  0: 'unreachable',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  409: 'conflict',
  422: 'unprocessable',
  503: 'unavailable',
};

function fallbackMessage(status: number): string {
  const key = FALLBACK_MESSAGES[status];
  return key ? i18n.t(`errors.http.${key}`) : i18n.t('errors.http.failed', { status });
}

/** UP-DP answers `{"error": "..."}`; the workflow engine `{"error": {"message": "..."}}`. */
function messageOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const nested = (error as { message?: unknown }).message;
    if (typeof nested === 'string' && nested) return nested;
  }
  return typeof message === 'string' && message ? message : null;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
}

export async function request<T>(url: string, { method, body, token, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, fallbackMessage(0));
  }

  const payload = await readBody(response);
  if (!response.ok) {
    throw new ApiError(response.status, messageOf(payload) ?? fallbackMessage(response.status));
  }
  return payload as T;
}
