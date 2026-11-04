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

import parser from 'cron-parser';
import cronstrue from 'cronstrue';
import i18n, { currentLanguage } from '../i18n';
import type { Deployment } from '../types/portal';

/** The console's placeholder for "no schedule": a date that never comes. */
const NEVER = '0 0 31 2 *';

export interface Schedule {
  cron: string;
  timezone: string;
  /** "At 02:00 AM, in Asia/Colombo". */
  description: string;
  next: Date;
}

/** The automation's schedule, or null when it runs only on demand. UP-DP leaves out a suspended deployment's. */
export function scheduleOf(deployment: Deployment | null | undefined): Schedule | null {
  const cron = deployment?.schedule?.cron?.trim();
  if (!deployment || !cron || cron === NEVER) return null;
  const timezone = deployment.schedule?.timezone || 'UTC';
  try {
    const next = parser.parseExpression(cron, { tz: timezone }).next().toDate();
    let text = cron;
    try {
      text = cronstrue.toString(cron, { verbose: false, locale: currentLanguage() });
    } catch {
      // An expression cronstrue can't read is still a schedule; show it as written.
    }
    return { cron, timezone, description: i18n.t('format.schedule', { schedule: text, timezone }), next };
  } catch {
    return null;
  }
}
