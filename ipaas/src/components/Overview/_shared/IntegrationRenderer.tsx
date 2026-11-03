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

import { Card, CardContent, Skeleton } from '@wso2/oxygen-ui';
import type { ReactNode } from 'react';
import type { Component } from '../../../types/component';
import type { Environment } from '../../../types/environment';
import type { IntegrationIdentity, IntegrationModule } from '../../../types/integration';
import EnvCardSkeleton from './EnvCardSkeleton';
import OverviewShell from './OverviewShell';

interface IntegrationRendererProps {
  component: Component;
  identity: IntegrationIdentity;
  environments: Environment[];
  versionId: string;
  projectId: string;
  orgHandler: string;
  projectHandler: string;
  deploymentPipelineId: string;
  isBuildInProgress?: boolean;
  /** The type's module, resolved once by `useIntegrationModule` in the page. */
  module: IntegrationModule | null;
}

/**
 * Single dispatch point used by `pages/Component.tsx`. Given the (already
 * resolved) type-specific module, it either:
 *   - shows per-env skeletons while the module chunk is still loading,
 *   - renders the module's `CustomOverview` if it provides one (outliers
 *     like Tailscale that have no env-card concept), or
 *   - hands the module to `OverviewShell`, which fills its slots and
 *     applies any shared cross-cutting features.
 *
 * The module is loaded by `useIntegrationModule` (shared with `HeaderShell`),
 * so the type is resolved once per page, not per consumer.
 */
export default function IntegrationRenderer({ component, identity, environments, versionId, projectId, orgHandler, projectHandler, deploymentPipelineId, isBuildInProgress, module }: IntegrationRendererProps): ReactNode {
  if (!module) {
    // The type module is a lazily-imported chunk; while it loads, show one
    // frame-shaped skeleton per environment so the cards take their final shape
    // immediately instead of flashing a spinner then popping in.
    return (
      <>
        {environments.map((env) => (
          <Card key={env.id} sx={{ mb: 3 }}>
            <CardContent>
              <Skeleton variant="text" width="30%" height={32} />
              <EnvCardSkeleton />
            </CardContent>
          </Card>
        ))}
      </>
    );
  }

  if (module.CustomOverview) {
    return <module.CustomOverview component={component} identity={identity} />;
  }

  return (
    <OverviewShell
      component={component}
      identity={identity}
      environments={environments}
      versionId={versionId}
      projectId={projectId}
      orgHandler={orgHandler}
      projectHandler={projectHandler}
      deploymentPipelineId={deploymentPipelineId}
      isBuildInProgress={isBuildInProgress}
      module={module}
    />
  );
}
