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

import { Alert, Link } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { cloudConsoleSubscriptionsUrl } from '../../paths';

const UPGRADE = 'Upgrade';

/** A plan limit reached. Its "Upgrade …" sentence, if any, links "Upgrade" to the subscriptions page. */
export default function PlanLimitAlert({ message, sx }: { message: string; sx?: object }): JSX.Element {
  const at = message.lastIndexOf(`. ${UPGRADE} `);
  if (at < 0)
    return (
      <Alert severity="warning" sx={sx}>
        {message}
      </Alert>
    );
  const upgradeAt = at + 2;
  return (
    <Alert severity="warning" sx={sx}>
      {message.slice(0, upgradeAt)}
      <Link href={cloudConsoleSubscriptionsUrl()} target="_blank" rel="noopener noreferrer" color="inherit" underline="always">
        {UPGRADE}
      </Link>
      {message.slice(upgradeAt + UPGRADE.length)}
    </Alert>
  );
}
