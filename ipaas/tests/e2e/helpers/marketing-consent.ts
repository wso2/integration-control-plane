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
 * The marketing consent prompt (src/components/MarketingConsentDialog.tsx) in the e2e suite.
 *
 * The prompt is a modal that opens on any signed-in page until the person answers, and while it
 * is open MUI hides the page behind it from role queries. Consent is one real record in Pardot
 * for the e2e user, shared with every WSO2 Cloud console, so the suite never records an answer:
 * decisions are answered in the browser and never reach ipaas-service.
 */

import type { BrowserContext, Request, Route } from '@playwright/test';
import { toMarketingConsent, type BffMarketingConsent } from '../../../src/api/_marketingConsentShape.js';
import { shouldAskMarketingConsent } from '../../../src/utils/marketingConsent.js';

/** ipaas-service's GET and POST /marketing-consent. */
export const MARKETING_CONSENT_PATH = '/marketing-consent';

/** The same route under whichever BFF base URL the console uses. */
const MARKETING_CONSENT_ROUTE = `**${MARKETING_CONSENT_PATH}`;

/** The prompt's title, which also names its dialog (MarketingConsentDialog). */
export const CONSENT_DIALOG_TITLE = 'Welcome to WSO2 Cloud';

// The BFF is on another origin, so an answer made here needs the headers the real one carries.
function corsHeaders(request: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': request.headers()['origin'] ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'no-store',
  };
}

async function answerPreflight(route: Route): Promise<void> {
  const request = route.request();
  await route.fulfill({
    status: 204,
    headers: {
      ...corsHeaders(request),
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': request.headers()['access-control-request-headers'] ?? 'authorization, content-type',
    },
  });
}

/**
 * Answers the consent read in the browser with `record`, and accepts every decision there too, so
 * none is recorded in Pardot. Returns the bodies the console sent, in order.
 */
export async function answerConsentReadAs(context: BrowserContext, record: BffMarketingConsent): Promise<unknown[]> {
  const sent: unknown[] = [];
  await context.route(MARKETING_CONSENT_ROUTE, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return answerPreflight(route);
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders(request), body: JSON.stringify(record) });
    }
    sent.push(request.postDataJSON());
    return route.fulfill({ status: 202, headers: corsHeaders(request), body: '' });
  });
  return sent;
}

/**
 * Keeps the prompt out of a context: its consent read answers "already confirmed". For the
 * journey, whose groups would otherwise meet the modal on every page while the e2e user has not
 * answered. Group 07b checks the prompt itself.
 */
export async function keepConsentPromptAway(context: BrowserContext): Promise<void> {
  await answerConsentReadAs(context, { optoutOfEmails: false, consentStatus: 'Confirmed' });
}

/**
 * Accepts consent decisions in the browser, so none is recorded in Pardot, and leaves the read
 * alone. Returns the bodies the console sent, in order.
 */
export async function holdConsentDecisions(context: BrowserContext): Promise<unknown[]> {
  const sent: unknown[] = [];
  await context.route(MARKETING_CONSENT_ROUTE, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fallback();
    if (request.method() === 'OPTIONS') return answerPreflight(route);
    sent.push(request.postDataJSON());
    return route.fulfill({ status: 202, headers: corsHeaders(request), body: '' });
  });
  return sent;
}

/** The statuses ipaas-service documents for GET /marketing-consent. */
export const CONSENT_READ_STATUSES: readonly number[] = [200, 403, 404, 502, 503];

/**
 * Whether the console should ask, given ipaas-service's answer to GET /marketing-consent. It
 * applies the console's own mapping and rule (toMarketingConsent, shouldAskMarketingConsent), so
 * the two cannot drift. A failed read or a body the console refuses shows no prompt.
 */
export function expectsConsentPrompt(status: number, body: unknown): boolean {
  if (status !== 200 || !body || typeof body !== 'object') return false;
  try {
    return shouldAskMarketingConsent(toMarketingConsent(body as BffMarketingConsent));
  } catch {
    return false;
  }
}
