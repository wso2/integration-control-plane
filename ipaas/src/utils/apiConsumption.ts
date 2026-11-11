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

import type { ApiKeyStatus, ApiKeySummary, JwtSecurity } from '../types/consumers';
import { formatDateTime } from './time';

/** Raw statuses meaning the key no longer authenticates. */
const REVOKED_STATUSES = new Set(['revoked', 'inactive', 'expired', 'deleted', 'disabled']);

/** Unknown values read as `active` — a live key must not look revoked on an unfamiliar label. */
export function normalizeKeyStatus(raw?: string): ApiKeyStatus {
  return raw && REVOKED_STATUSES.has(raw.trim().toLowerCase()) ? 'revoked' : 'active';
}

/** The name a key is listed under: the one it was issued with, else its id. */
export function apiKeyLabel(key: ApiKeySummary): string {
  return key.displayName?.trim() || key.name;
}

/** Row subtitle: the masked key, then when it was issued and when it expires, as far as the platform reports them. */
export function apiKeySubtitle(key: ApiKeySummary): string {
  const parts = [key.maskedApiKey];
  const created = key.createdAt ? formatDateTime(key.createdAt) : '';
  if (created && created !== '—') parts.push(`Created ${created}`);
  const expires = key.expiresAt ? formatDateTime(key.expiresAt) : '';
  if (expires && expires !== '—') parts.push(`Expires ${expires}`);
  return parts.filter(Boolean).join(' · ');
}

/** Names are unique per endpoint only, so `existing` is always that one endpoint's list. */
export function isKeyNameTaken(name: string, existing: readonly string[]): boolean {
  const candidate = name.trim().toLowerCase();
  return candidate !== '' && existing.some((n) => n.trim().toLowerCase() === candidate);
}

/** Joins a command's parts into a multi-line shell command. */
const shellLines = (parts: string[]): string => parts.join(' \\\n  ');

/** Every scope any operation of the API asks for, in a stable order: a client's token needs the ones its calls require. */
export function jwtScopes(jwt: JwtSecurity | undefined): string[] {
  const scopes = new Set<string>();
  for (const requirement of Object.values(jwt?.operations ?? {})) {
    for (const scope of [...(requirement.allOf ?? []), ...(requirement.anyOf ?? [])]) scopes.add(scope);
  }
  return [...scopes].sort();
}

/** A client credentials token request to the identity platform, with placeholders for the client's own ID and secret. */
export function tokenRequestCurl(tokenEndpoint: string | undefined, scopes: readonly string[] = []): string {
  const parts = [`curl -X POST '${tokenEndpoint || '<token-endpoint>'}'`, "-u '<client-id>:<client-secret>'", "-d 'grant_type=client_credentials'"];
  if (scopes.length) parts.push(`-d 'scope=${scopes.join(' ')}'`);
  return shellLines(parts);
}

/** A call to the API with the access token, sent in the header the API reads it from. */
export function apiCallCurl(publicUrl: string | undefined, tokenHeader: string): string {
  return shellLines([`curl '${publicUrl || '<api-url>'}'`, `-H '${tokenHeader.replace('<token>', '<access-token>')}'`]);
}
