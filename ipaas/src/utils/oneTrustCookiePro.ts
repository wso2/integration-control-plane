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

// Ported from choreo-console's src/utils/oneTrustCookiePro — trimmed to the one category this app
// actually gates on (Moesif is a behavioral/API-analytics tracker, so it belongs under OneTrust's
// "Performance Cookies" analytics category, not "Strictly Necessary" — that category is typically
// pre-granted regardless of user choice, which would make consent-gating on it meaningless). Add
// the other categories back here if another tracker needs to check them.

declare global {
  const OnetrustActiveGroups: string;
  const OneTrust: { OnConsentChanged: (callback: (event: Event) => void) => void };
}

enum CookieProCategory {
  Analytics = 'Performance Cookies',
}

// OneTrust's own script populates `OnetrustActiveGroups` (a comma-joined list of consented
// category codes, e.g. "C0001,C0002") once it finishes initializing — see onConsentChange below,
// which only reads this after OneTrust has signaled it's ready.
function getUserAllowedCategories(): CookieProCategory[] | null {
  if (typeof OnetrustActiveGroups === 'undefined') return null;
  const categoryLabels: Record<string, CookieProCategory> = { C0002: CookieProCategory.Analytics };
  return OnetrustActiveGroups.split(',')
    .filter(Boolean)
    .map((code) => categoryLabels[code])
    .filter((category): category is CookieProCategory => category !== undefined);
}

export function isAnalyticsCookiesAllowed(): boolean {
  return getUserAllowedCategories()?.includes(CookieProCategory.Analytics) ?? false;
}

/**
 * Runs `callback` once immediately and again every time the user changes their consent choices
 * later (e.g. via "manage cookie preferences"), via OneTrust's own OnConsentChanged hook. Callers
 * only need this once OneTrust itself has signaled it's ready (see the OptanonWrapper callback in
 * tracking.ts) — `OnetrustActiveGroups`/`OneTrust` aren't populated before that.
 */
export function onConsentChange(callback: () => void): void {
  callback();
  // typeof, not optional chaining — OneTrust may not exist as a global at all (rather than
  // existing-but-undefined), and only typeof is safe against a truly undeclared identifier.
  if (typeof OneTrust !== 'undefined') {
    OneTrust.OnConsentChanged(callback);
  }
}
