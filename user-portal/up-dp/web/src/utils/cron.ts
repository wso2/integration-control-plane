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
