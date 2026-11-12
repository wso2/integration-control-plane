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

import { Button, CircularProgress, Tooltip } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { DEPLOY_REFUSAL } from '../../utils/userPortal';
import type { PublishFlow } from './usePublishFlow';

interface PublishButtonProps {
  flow: PublishFlow;
  /** Whether a publish in the environment would pass every publishing rule now. */
  publishable: boolean;
  /** Whether it redeploys a workflow, so the flow confirms it first. */
  redeploys: boolean;
  /** Something else holds the publish back for now, such as the rules being read again. */
  busy?: boolean;
  /** Why a publish waits for now, said in place of the rules, which aren't read meanwhile; it holds the button back. */
  holdReason?: string;
  label: string;
  variant?: 'text' | 'contained';
  size?: 'small' | 'medium';
}

/**
 * Publish to the User Portal, as every place in the console offers it: refused, with the reason, to a role that can't
 * deploy and while a publishing rule is broken, and confirmed first when it redeploys a workflow (`usePublishFlow`).
 */
export default function PublishButton({ flow, publishable, redeploys, busy = false, holdReason, label, variant = 'text', size = 'small' }: PublishButtonProps): JSX.Element {
  const canDeploy = useCan()(Scopes.INTEGRATION_DEPLOY);
  return (
    <Tooltip title={!canDeploy ? DEPLOY_REFUSAL : (holdReason ?? (publishable ? '' : 'Fix what is listed below to publish.'))}>
      <span>
        <Button variant={variant} size={size} onClick={() => flow.request(redeploys)} disabled={!canDeploy || !publishable || flow.isPending || busy || !!holdReason} startIcon={flow.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {flow.isPending ? 'Publishing…' : label}
        </Button>
      </span>
    </Tooltip>
  );
}
