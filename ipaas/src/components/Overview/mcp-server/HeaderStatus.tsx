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

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { HeaderStatusProps } from '../../../types/integration';
import { useSchemaConfig } from '../../../hooks/useConfiguration';
import StatusDot from '../_shared/StatusDot';
import ConfigureButton from '../_shared/ConfigureButton';
import ConfigureDrawer from '../../EnvironmentCard/ConfigureDrawer';
import { hasMissingRequiredConfigs } from '../_shared/configStatus';

/**
 * MCP Server's left-header slot: a deployment status dot + Configure entry
 * point. Like Integration as API, the Configure drawer keeps its Endpoints
 * step — an MCP server exposes an endpoint (the `/mcp` URL).
 */
export default function HeaderStatus({
  component,
  env,
  projectId,
  versionId,
  orgHandler,
  projectHandler,
  componentHandler,
  envTemplateId,
  hasDeployment,
  deploymentStatusV2,
  deployedCommitSha,
  onNotify,
  releaseId,
  releaseMgtReleaseId,
  releaseMgtDeploymentId,
  buildId,
}: HeaderStatusProps): ReactNode {
  const [configureOpen, setConfigureOpen] = useState(false);

  // Switch the Configure button to "Configure to Continue" when the schema has
  // required configs without values (tools can't be fetched until it's configured + deployed).
  const { data: schemaConfig } = useSchemaConfig(projectId, component.id, envTemplateId, versionId, deployedCommitSha);
  const missingConfigs = useMemo(() => hasMissingRequiredConfigs(schemaConfig), [schemaConfig]);

  return (
    <>
      <StatusDot status={deploymentStatusV2} />
      {hasDeployment && (
        <>
          <ConfigureButton onClick={() => setConfigureOpen(true)} hasMissingConfigs={missingConfigs} />
          <ConfigureDrawer
            onSaved={() => onNotify({ text: 'Configuration saved successfully.', severity: 'success' })}
            open={configureOpen}
            onClose={() => setConfigureOpen(false)}
            orgHandler={orgHandler}
            projectId={projectId}
            componentId={component.id}
            envId={env.id}
            versionId={versionId}
            componentName={componentHandler}
            projectHandler={projectHandler}
            commitHash={deployedCommitSha}
            releaseId={releaseId}
            displayType={component.displayType}
            releaseMgtReleaseId={releaseMgtReleaseId}
            releaseMgtDeploymentId={releaseMgtDeploymentId}
            envTemplateId={envTemplateId}
            buildId={buildId}
          />
        </>
      )}
    </>
  );
}
