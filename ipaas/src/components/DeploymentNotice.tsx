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

import { CirclePlay, CircleStop, Hourglass, Rocket, TriangleAlert } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { deploymentNotice, type DeploymentNoticeKind } from '../utils/deploymentNotice';
import EnvEmptyNotice from './EnvEmptyNotice';

interface DeploymentNoticeProps {
  hasDeployment: boolean;
  /** Raw `deploymentStatusV2` of this environment's deployment. */
  status?: string | null;
  envCritical: boolean;
}

const NOTICE_ICONS: Record<DeploymentNoticeKind, typeof Rocket> = {
  notDeployed: Rocket,
  deploying: Hourglass,
  error: TriangleAlert,
  suspended: CircleStop,
  noExecutions: CirclePlay,
};

/**
 * Empty state for an environment card with no execution data. The copy tracks
 * this environment's deployment status, so a card whose actions are disabled
 * explains why rather than pointing at them.
 */
export default function DeploymentNotice({ hasDeployment, status, envCritical }: DeploymentNoticeProps): JSX.Element {
  const { kind, message } = deploymentNotice(hasDeployment, status, envCritical);
  const Icon = NOTICE_ICONS[kind];

  return <EnvEmptyNotice icon={Icon}>{message}</EnvEmptyNotice>;
}
