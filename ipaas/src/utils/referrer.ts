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
 * Where a visit came from, as one of a few buckets. Never the host itself: a referrer can name a customer's internal
 * site, and analytics wants one bucket per source.
 */
export const REFERRER_SOURCES = ['direct', 'wso2-cloud', 'wso2', 'search', 'github', 'other', 'unknown'] as const;
export type ReferrerSource = (typeof REFERRER_SOURCES)[number];

export interface ReferrerContext {
  /** This page's origin. */
  origin: string;
  /** The console's base path, '' for a root build. Same-origin pages outside it are the other WSO2 Cloud consoles. */
  consolePath: string;
  /** Hosts of the identity provider: a referrer from one is a step of signing in. */
  signInHosts: string[];
  /** Same-origin paths of the gateway's sign-in flow. */
  signInPaths: string[];
}

const SEARCH_HOST = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia)\.[a-z.]+$/;

const under = (path: string, prefix: string): boolean => prefix !== '' && (path === prefix || path.startsWith(`${prefix.replace(/\/$/, '')}/`));

/**
 * The source a referrer names, or undefined when it is a step of signing in or the console itself, which say nothing
 * about where the visit came from.
 */
export function referrerSource(referrer: string, context: ReferrerContext): ReferrerSource | undefined {
  if (!referrer) return 'direct';
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return 'other';
  }
  const host = url.hostname.toLowerCase();
  if (url.origin === context.origin) {
    if (context.signInPaths.some((path) => under(url.pathname, path))) return undefined;
    if (context.consolePath === '' || under(url.pathname, context.consolePath)) return undefined;
    return 'wso2-cloud';
  }
  if (context.signInHosts.includes(host)) return undefined;
  if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
  if (SEARCH_HOST.test(host)) return 'search';
  if (host === 'wso2.com' || host.endsWith('.wso2.com')) return 'wso2';
  return 'other';
}
