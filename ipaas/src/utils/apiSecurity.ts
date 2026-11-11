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

import { errorField, httpCodeOf, httpStatusOf } from './apiErrors';

/** Helpers for the cloud API security & consumption surface. */

/** `Error.name` marking a message that is already written for the user. */
export const USER_FACING_ERROR = 'UserFacingError';

/**
 * Build an error whose message {@link friendlyApiError} passes through verbatim.
 * Use it when the service layer knows something the caller's generic fallback
 * would hide — e.g. a partially-applied write the user must act on.
 */
export function userFacingError(message: string, cause?: unknown): Error {
  const err = new Error(message);
  err.name = USER_FACING_ERROR;
  if (cause !== undefined) err.cause = cause;
  return err;
}

/**
 * Turn a raw BFF failure into a message a user can act on.
 *
 * The cloud client throws `HTTP {status}: {body}` (see `api/_client.ts`),
 * and the body is usually a gateway string like `404 page not found` — useless
 * in a dialog. This maps the status to plain wording and falls back to the
 * caller's context sentence when the status carries nothing specific.
 *
 * Raw bodies are never surfaced: they leak internal routing detail and read as
 * a crash to the user.
 */
export function friendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === USER_FACING_ERROR) return error.message;

  const coded = codedApiError(error);
  if (coded) return coded;

  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const status = httpStatusOf(error);

  switch (status) {
    case 400:
      return `${fallback} The request was rejected — check the values and try again.`;
    case 401:
      return 'Your session has expired. Sign in again and retry.';
    case 403:
      return 'You do not have permission to make this change.';
    case 404:
      return `${fallback} This endpoint is not exposed as an API on the gateway yet.`;
    case 409:
      return `${fallback} The endpoint is not exposed as an API yet — expose it first.`;
    case 503:
      return 'The API gateway is unavailable right now. Try again in a moment.';
    default:
      break;
  }

  if (status >= 500) return 'Something went wrong on the server. Try again in a moment.';
  // fetch() rejects with a TypeError before any status exists.
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return 'Could not reach the server. Check your connection and try again.';
  return fallback;
}

/**
 * The notice an endpoint drawer shows when its configuration cannot be read. 409 (not exposed as
 * an API yet) and 503 (not configured in this environment) are states rather than failures, so
 * each gets copy saying what to do; anything else falls back to `friendlyApiError`.
 */
export function endpointLoadNotice(error: unknown, copy: { notExposed: string; unavailable: string; readFailed: string }): { text: string; severity: 'info' | 'warning' } | null {
  if (!error) return null;
  const coded = codedApiError(error);
  if (coded) return { text: coded, severity: 'warning' };
  switch (httpStatusOf(error)) {
    case 409:
      return { text: copy.notExposed, severity: 'info' };
    case 503:
      return { text: copy.unavailable, severity: 'warning' };
    default:
      return { text: friendlyApiError(error, copy.readFailed), severity: 'warning' };
  }
}

/**
 * The wording for a BFF error code, or '' when the code needs none of its own. Codes are checked
 * before the status: one 409 can mean "not exposed yet", "change it in the entry environment" or
 * "the source has no build to promote", and only the code tells them apart.
 */
export function codedApiError(error: unknown): string {
  const entry = errorField(error, 'entryEnvironment');
  const source = errorField(error, 'sourceEnvironment');
  switch (httpCodeOf(error)) {
    case 'APIP_QUOTA_EXCEEDED':
      return 'Your organization has reached its API limit on the API Platform. Remove an API you no longer need, or contact support to raise the limit.';
    case 'CHANGE_REQUIRES_ENTRY_ENVIRONMENT':
    case 'APIP_TARGET_PARAMETER_CHANGE_UNSUPPORTED':
      return entry ? `This environment takes API changes only through promotion. Make the change in ${entry}, then promote.` : 'This environment takes API changes only through promotion. Make the change in the first environment, then promote.';
    case 'APIP_SOURCE_BUILD_UNAVAILABLE':
      return source ? `${source} isn’t running this release’s API. Deploy it there, then promote again.` : 'The source environment isn’t running this release’s API. Deploy it there, then promote again.';
    case 'SERVED_BY_AI_GATEWAY':
      return 'This MCP server is public through the AI gateway, so its visibility can’t be changed.';
    case 'MCP_POLICIES_IN_AGENT_MANAGER':
      return 'This MCP server’s gateway policies are managed on the AI gateway in Agent Manager.';
    case 'MCP_API_KEY_NOT_CHECKED':
      return 'This MCP server’s AI gateway URL takes no API key, so it needs no test key.';
    case 'MCP_KEYS_UNAVAILABLE':
      return 'Test keys aren’t available for this MCP server yet.';
    default:
      return '';
  }
}

/**
 * The banner for API settings this environment can't change, or null when it can. Outside the
 * pipeline's entry environment the API changes only by promotion; on a build made before builds
 * recorded their settings, what the environment enforces isn't known at all.
 */
export function readOnlyApiSettingsNotice(config: { editable?: boolean; entryEnvironment?: string; stateUnknown?: boolean } | null | undefined): string | null {
  const entry = config?.entryEnvironment || 'the first environment';
  if (config?.stateUnknown) return `This environment runs an API built before its settings were recorded, so they can’t be shown. They are known again after the next promotion from ${entry}.`;
  if (config?.editable === false) return `Managed in ${entry}. Change it there, then promote to apply it here.`;
  return null;
}
