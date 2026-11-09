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

import { Divider, Skeleton } from '@wso2/oxygen-ui';
import type { ReactNode } from 'react';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import type { EnvCardBodyProps } from '../../../types/integration';
import { tokenServiceUrlOf, voiceTesterUnavailableReason } from '../../../utils/voiceAgent';
import VoiceAgentTester from '../../VoiceAgent/VoiceAgentTester';

const DIVIDER_SX = { my: 2 } as const;

export default function EnvCardBody({ component, versionId, releaseId, hasDeployment, deploymentStatusV2 }: EnvCardBodyProps): ReactNode {
  const { data: endpoints, isLoading, isError } = useEnvEndpoints(component.id, versionId, releaseId);
  const tokenServiceUrl = tokenServiceUrlOf(endpoints);

  const unavailableReason = voiceTesterUnavailableReason({ hasDeployment, deploymentStatus: deploymentStatusV2, endpointsFailed: isError, tokenServiceUrl });

  return (
    <>
      <Divider sx={DIVIDER_SX} />
      {hasDeployment && isLoading ? <Skeleton variant="rounded" height={76} /> : <VoiceAgentTester tokenServiceUrl={tokenServiceUrl} unavailableReason={unavailableReason} />}
    </>
  );
}
