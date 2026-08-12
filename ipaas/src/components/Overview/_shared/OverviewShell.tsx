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

import { Alert, Box, Typography } from '@wso2/oxygen-ui';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { Component } from '../../../types/component';
import type { Environment } from '../../../types/environment';
import type { IntegrationIdentity, IntegrationModule } from '../../../types/integration';
import { IS_CLOUD } from '../../../features';
import PromoteButton from '../../EnvironmentCard/PromoteButton';
import EnvCardShell from './EnvCardShell';

interface OverviewShellProps {
  component: Component;
  identity: IntegrationIdentity;
  environments: Environment[];
  versionId: string;
  projectId: string;
  orgHandler: string;
  projectHandler: string;
  deploymentPipelineId: string;
  latestCommit?: { sha: string; message: string } | null;
  isBuildInProgress?: boolean;
  module: IntegrationModule;
}

/**
 * The shared layout every non-outlier integration type renders inside.
 *
 * Renders any `OverviewHeaderExtras` slot, then alternates `EnvCardShell`
 * (with the module's `EnvCardBody` plugged in) and a `PromoteButton` between
 * adjacent environments — preserving the existing pages/Component.tsx layout
 * so the bridge produces a visually identical overview to the old path.
 *
 * Cross-cutting shared features (e.g. a future Build History card) will be
 * added at the top of this component so every type that uses the shell
 * inherits them automatically; Tailscale-style outliers, which use
 * `CustomOverview`, are excluded by structure.
 */
export default function OverviewShell({ component, identity, environments, versionId, projectId, orgHandler, projectHandler, deploymentPipelineId, latestCommit, isBuildInProgress, module }: OverviewShellProps): ReactNode {
  const { EnvCardBody, OverviewHeaderExtras } = module;

  if (!EnvCardBody) {
    return (
      <Alert severity="warning">
        <Typography variant="body2">
          Integration type <strong>{identity.type}</strong> declares no <code>EnvCardBody</code> and no <code>CustomOverview</code>.
        </Typography>
      </Alert>
    );
  }

  if (environments.length === 0) {
    return (
      <Box sx={{ py: 4 }}>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          No environments configured for this project yet.
        </Typography>
      </Box>
    );
  }

  return (
    <>
      {OverviewHeaderExtras && <OverviewHeaderExtras component={component} identity={identity} />}
      {environments.map((env, i) => (
        <Fragment key={env.id}>
          <EnvCardShell
            component={component}
            env={env}
            prevEnv={i > 0 ? environments[i - 1] : undefined}
            versionId={versionId}
            projectId={projectId}
            orgHandler={orgHandler}
            projectHandler={projectHandler}
            deploymentPipelineId={deploymentPipelineId}
            latestCommit={latestCommit}
            isBuildInProgress={isBuildInProgress}
            module={module}
          />
          {/* In cloud the pipeline decides whether this env promotes at all —
              including out of the last card — so PromoteButton renders null when
              there is no hop. Elsewhere, adjacency still gates it. */}
          {(IS_CLOUD || i < environments.length - 1) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              <PromoteButton orgHandler={orgHandler} componentId={component.id} versionId={versionId} deploymentPipelineId={deploymentPipelineId} sourceEnvId={env.id} targetEnvId={environments[i + 1]?.id} />
            </Box>
          )}
        </Fragment>
      ))}
    </>
  );
}
