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
import type { JSX, ReactNode } from 'react';
import { cloudConsoleSubscriptionsUrl } from '../../paths';

const UPGRADE = 'Upgrade';

/** A plan-limit sentence with the "Upgrade" of its "… Upgrade …" sentence linked to the subscriptions page. */
export function UpgradeLinkedText({ message }: { message: string }): ReactNode {
  const at = message.lastIndexOf(`. ${UPGRADE} `);
  if (at < 0) return message;
  const upgradeAt = at + 2;
  return (
    <>
      {message.slice(0, upgradeAt)}
      <Link href={cloudConsoleSubscriptionsUrl()} target="_blank" rel="noopener noreferrer" color="inherit" underline="always">
        {UPGRADE}
      </Link>
      {message.slice(upgradeAt + UPGRADE.length)}
    </>
  );
}

/** A plan limit the action goes over, as a warning. */
export default function PlanLimitWarning({ message, severity = 'warning', onClose, sx }: { message: string; severity?: 'warning' | 'info'; onClose?: () => void; sx?: object }): JSX.Element {
  return (
    <Alert severity={severity} onClose={onClose} sx={sx}>
      <UpgradeLinkedText message={message} />
    </Alert>
  );
}
