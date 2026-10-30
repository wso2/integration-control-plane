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

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const toCamelCase = (s: string) => {
  const words = s.split(/[\s_-]+/);
  if (words.length === 0) return '';
  return words.map((word, index) => (index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join('');
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toHandler(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function formatRepoNameToDisplayName(repoName: string): string {
  return repoName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toProjectHandler(name: string, maxLength: number): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, maxLength)
    .replace(/^-+|-+$/g, '');
}

/** `handler` with a `-xxxxx` suffix, trimmed so the result still fits in `maxLength`. */
export function withRandomSuffix(handler: string, maxLength: number, suffix: string = Math.random().toString(36).slice(2, 7)): string {
  return `${handler.substring(0, maxLength - suffix.length - 1).replace(/-+$/, '')}-${suffix}`;
}

export const generateUUID = (): string => crypto.randomUUID();

/** Truncate to `max` characters, appending an ellipsis when it was longer. */
export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Two letters for an avatar: first and last word of a name, or the first two of a single word (an email reads by its local part). */
export function userInitials(name: string): string {
  const words = name
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}
