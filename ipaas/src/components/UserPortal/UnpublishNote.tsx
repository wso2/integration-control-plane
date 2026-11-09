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

import { Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useEntryEnvironment } from '../../hooks/useEntryEnvironment';
import * as styles from './UserPortal.styles';

interface UnpublishNoteProps {
  /** Unpublishing a workflow gives its Management API back to the console, where the environment's API security allows. */
  isWorkflow: boolean;
  projectId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
}

/**
 * What unpublishing does, for its confirmation. Any integration leaves the User Portal there. A workflow is redeployed
 * to take the console's API key again, which brings the console's workflow views back, except in an environment that
 * takes its API security by promotion: the gateway there keeps taking only User Portal sign-ins until a promotion
 * brings an API key.
 */
export default function UnpublishNote({ isWorkflow, projectId, environment, envName }: UnpublishNoteProps): JSX.Element {
  const entry = useEntryEnvironment(projectId, environment);
  const keepsPortalSignIn = isWorkflow && !entry.loading && !entry.isEntry;
  return (
    <>
      <Typography variant="body2">The User Portal&apos;s users no longer see this integration there.{isWorkflow ? '' : ' The integration keeps running.'}</Typography>
      {isWorkflow && (
        <Typography variant="body2" sx={styles.dialogBodySx}>
          The workflow is redeployed in {envName} so its Workflow Management API takes the console&apos;s API key again.{' '}
          {keepsPortalSignIn ? (
            <>
              {envName} takes its API security from {entry.entryEnvironmentName} by promotion, though, so the gateway keeps taking only User Portal sign-ins here, and the console&apos;s workflow views stay off. To turn them on again, put the API back on API
              key in {entry.entryEnvironmentName}, as unpublishing the workflow there does, then promote it here.
            </>
          ) : (
            <>The console&apos;s workflow views work there again.</>
          )}
        </Typography>
      )}
    </>
  );
}
