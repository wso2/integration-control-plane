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

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  // Some callers hand us a bare message string rather than an Error.
  return typeof error === 'string' ? error : '';
}

/**
 * HTTP status behind a rejected API call, or `NaN` when there is none.
 *
 * The BFF client rejects with a `BffError`, which carries a typed `status` — read
 * that in preference to the message. Plain fetches (prebuilt catalog, RAG retrieval)
 * throw an `Error` whose message holds `HTTP {status}`, and some callers pass a bare
 * string, so the text is the only signal there.
 */
export function httpStatusOf(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return Number(/\bHTTP (\d{3})\b/.exec(messageOf(error))?.[1]);
}

/** A 404 from a resource query — "this does not exist", not "the call broke". */
export function isNotFoundError(error: unknown): boolean {
  return httpStatusOf(error) === 404;
}

/**
 * The API layer has no implementation for this call — the `ni()` stubs in
 * `src/api/` throw `[cloud] domain.fn: not implemented`.
 * A feature absent from the product is not a failure, so callers should treat it
 * as "unavailable here" rather than showing an error.
 */
export function isUnsupportedError(error: unknown): boolean {
  return /:\s*not implemented\b/.test(messageOf(error));
}

/** A plan limit, not a malfunction — callers show `error.message` as a warning. */
export function isQuotaError(error: unknown): boolean {
  return httpStatusOf(error) === 402;
}

/**
 * The sentence to show for a failed API call.
 *
 * The BFF writes a user-facing sentence for each outcome it distinguishes, and
 * `BffError.message` carries it unchanged. Those sentences are the only thing
 * telling one failure from another — a feature switched off in this deployment,
 * a missing permission and a wrong component type otherwise read alike.
 *
 * Anything without a response behind it — a dropped connection, a gateway page —
 * has no sentence worth showing, so the caller's own wording stands.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (Number.isNaN(httpStatusOf(error))) return fallback;
  const message = messageOf(error).trim();
  // The shape the client falls back to when the body carried no sentence.
  return !message || /^HTTP \d{3}:/.test(message) ? fallback : message;
}

/** ipaas-service refused the call because the user's role lacks a scope (`code: INSUFFICIENT_SCOPE`). */
export function isPermissionError(error: unknown): boolean {
  if (httpStatusOf(error) !== 403 || typeof error !== 'object' || error === null || !('body' in error)) return false;
  try {
    return (JSON.parse(String(error.body)) as { code?: unknown }).code === 'INSUFFICIENT_SCOPE';
  } catch {
    return false;
  }
}
