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

import { Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { UserPortalRefusal } from '../../types/userPortal';
import * as styles from './UserPortal.styles';
import UserPortalReason from './UserPortalReason';

interface PublishRefusalsProps {
  reasons: UserPortalRefusal[];
  envName: string;
}

/** Each publishing rule an integration breaks in an environment, worded from its code, so the reader knows what to change. */
export default function PublishRefusals({ reasons, envName }: PublishRefusalsProps): JSX.Element {
  return (
    <Stack gap={0.5} sx={styles.rowNoteSx} role="group" aria-label="Why it can't be published">
      {reasons.map((reason) => (
        <UserPortalReason key={reason.code + reason.message} reason={reason} envName={envName} />
      ))}
    </Stack>
  );
}
