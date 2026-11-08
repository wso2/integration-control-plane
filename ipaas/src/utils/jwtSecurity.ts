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

import { DEFAULT_FORWARDED_TOKEN_HEADER, DEFAULT_OAUTH_HEADER_PREFIX, MAX_JWT_AUDIENCES, MAX_SCOPES_PER_LIST, MAX_TOKEN_OPTION_LENGTH, OAUTH_HEADER } from '../constants/apiConsumption';
import type { JwtSecurity, ScopeRequirement } from '../types/consumers';

/** One operation's scopes as the form edits them: both lists always present. */
export interface ScopeLists {
  allOf: string[];
  anyOf: string[];
}

/** The OAuth (jwt) options as the security drawer edits them, every default filled in. */
export interface JwtForm {
  headerName: string;
  authHeaderPrefix: string;
  audiences: string[];
  forwardToken: boolean;
  forwardedTokenHeader: string;
  forwardTokenStripScheme: boolean;
  /** Keyed `"<METHOD> <path>"`. An operation absent, or with both lists empty, needs no scope. */
  scopes: Record<string, ScopeLists>;
}

export interface JwtFormErrors {
  headerName?: string;
  authHeaderPrefix?: string;
  forwardedTokenHeader?: string;
  audiences?: string;
  /** Per operation key. */
  scopes?: Record<string, string>;
}

/** An RFC 9110 token, the form of a header name. jwt-auth checks header names and the prefix against it. */
const HTTP_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Headers the BFF refuses to read a token from or forward it into, lower-cased: HTTP framing and
 * hop-by-hop headers, Origin, the headers the gateway sets to describe the client, and proxy
 * credentials. Kept in step with ipaas-service's reservedTokenHeaders, so the form flags them before a save.
 */
const RESERVED_TOKEN_HEADERS = new Set([
  'connection',
  'content-length',
  'content-type',
  'cookie',
  'host',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'origin',
  'forwarded',
  'via',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-real-ip',
  'x-request-id',
  'proxy-authorization',
]);
const RESERVED_TOKEN_HEADER_PREFIXES = ['access-control-', 'x-envoy-'];

/** Trims each value and drops empty ones and repeats, keeping the first order seen. */
export function cleanValues(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
}

/**
 * Splits scope entries on whitespace before cleaning them. A token's `scope` claim is
 * space-separated, so "a b" typed as one entry means two scopes, never one that could never match.
 */
export function splitScopes(values: readonly string[]): string[] {
  return cleanValues(values.flatMap((v) => v.split(/\s+/)));
}

/** The form for a saved jwt block, or for a new one when the API is not on jwt yet. */
export function jwtFormOf(jwt: JwtSecurity | undefined): JwtForm {
  const scopes: Record<string, ScopeLists> = {};
  for (const [key, requirement] of Object.entries(jwt?.operations ?? {})) {
    scopes[key] = { allOf: requirement.allOf ?? [], anyOf: requirement.anyOf ?? [] };
  }
  return {
    headerName: jwt?.headerName || OAUTH_HEADER,
    authHeaderPrefix: jwt?.authHeaderPrefix || DEFAULT_OAUTH_HEADER_PREFIX,
    audiences: jwt?.audiences ?? [],
    forwardToken: jwt?.forwardToken ?? true,
    forwardedTokenHeader: jwt?.forwardedTokenHeader || DEFAULT_FORWARDED_TOKEN_HEADER,
    forwardTokenStripScheme: jwt?.forwardTokenStripScheme ?? false,
    scopes,
  };
}

/**
 * The jwt block a save sends. PUT replaces the whole block, so every option goes, defaults
 * included, and only operations with scopes are listed. `issuers` is carried back as saved: the
 * console offers no choice of key manager while the gateway trusts only one.
 */
export function toJwtSecurity(form: JwtForm, issuers: string[] | undefined): JwtSecurity {
  const operations: Record<string, ScopeRequirement> = {};
  for (const [key, lists] of Object.entries(form.scopes)) {
    const allOf = splitScopes(lists.allOf);
    const anyOf = splitScopes(lists.anyOf);
    if (!allOf.length && !anyOf.length) continue;
    operations[key] = { ...(allOf.length ? { allOf } : {}), ...(anyOf.length ? { anyOf } : {}) };
  }
  return {
    ...(issuers?.length ? { issuers } : {}),
    audiences: cleanValues(form.audiences),
    operations,
    headerName: form.headerName.trim() || OAUTH_HEADER,
    authHeaderPrefix: form.authHeaderPrefix.trim() || DEFAULT_OAUTH_HEADER_PREFIX,
    forwardToken: form.forwardToken,
    forwardedTokenHeader: form.forwardedTokenHeader.trim() || DEFAULT_FORWARDED_TOKEN_HEADER,
    forwardTokenStripScheme: form.forwardTokenStripScheme,
  };
}

function headerNameError(value: string): string | undefined {
  const name = value.trim();
  if (!name) return undefined; // empty takes the default
  if (name.length > MAX_TOKEN_OPTION_LENGTH || !HTTP_TOKEN.test(name)) return `Use at most ${MAX_TOKEN_OPTION_LENGTH} letters, digits and !#$%&'*+-.^_\`|~, with no spaces.`;
  const lower = name.toLowerCase();
  if (RESERVED_TOKEN_HEADERS.has(lower) || RESERVED_TOKEN_HEADER_PREFIXES.some((p) => lower.startsWith(p))) return `${name} can’t carry the token.`;
  return undefined;
}

/** What the BFF would refuse in the form, per field, so the drawer can say so before saving. */
export function jwtFormErrors(form: JwtForm): JwtFormErrors {
  const errors: JwtFormErrors = {};
  const headerName = headerNameError(form.headerName);
  if (headerName) errors.headerName = headerName;

  const prefix = form.authHeaderPrefix.trim();
  if (prefix && (prefix.length > MAX_TOKEN_OPTION_LENGTH || !HTTP_TOKEN.test(prefix))) errors.authHeaderPrefix = `Use one word of at most ${MAX_TOKEN_OPTION_LENGTH} letters, digits and !#$%&'*+-.^_\`|~.`;

  // The forwarded header is only written when the token is forwarded.
  const forwarded = form.forwardToken ? headerNameError(form.forwardedTokenHeader) : undefined;
  if (forwarded) errors.forwardedTokenHeader = forwarded;

  if (cleanValues(form.audiences).length > MAX_JWT_AUDIENCES) errors.audiences = `Add at most ${MAX_JWT_AUDIENCES} audiences.`;

  for (const [key, lists] of Object.entries(form.scopes)) {
    if (splitScopes(lists.allOf).length > MAX_SCOPES_PER_LIST || splitScopes(lists.anyOf).length > MAX_SCOPES_PER_LIST) {
      errors.scopes = { ...errors.scopes, [key]: `Add at most ${MAX_SCOPES_PER_LIST} scopes to each list.` };
    }
  }
  return errors;
}

export const hasJwtFormErrors = (errors: JwtFormErrors): boolean => Object.keys(errors).length > 0;

/** The header a client sends, as `Authorization: Bearer <token>`. */
export function tokenHeaderExample(jwt: JwtSecurity | undefined): string {
  const form = jwtFormOf(jwt);
  return `${form.headerName}: ${form.authHeaderPrefix} <token>`;
}

/** What the backend receives, as `X-Forwarded-Authorization: Bearer <token>`, or null when the token isn't forwarded. */
export function forwardedTokenExample(jwt: JwtSecurity | undefined): string | null {
  const form = jwtFormOf(jwt);
  if (!form.forwardToken) return null;
  return `${form.forwardedTokenHeader}: ${form.forwardTokenStripScheme ? '' : `${form.authHeaderPrefix} `}<token>`;
}

/** One operation's requirement in a line: `All of: a, b · Any of: c`, or '' when it needs none. */
export function scopeRequirementText(requirement: ScopeRequirement | undefined): string {
  const parts: string[] = [];
  if (requirement?.allOf?.length) parts.push(`All of: ${requirement.allOf.join(', ')}`);
  if (requirement?.anyOf?.length) parts.push(`Any of: ${requirement.anyOf.join(', ')}`);
  return parts.join(' · ');
}
