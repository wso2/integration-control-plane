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

import { CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSchemaConfig } from '../../../hooks/useConfiguration';
import type { HeaderStatusProps } from '../../../types/integration';
import ConfigureButton from '../_shared/ConfigureButton';
// Transitional: the legacy ConfigureDrawer (branches internally on `isAutomation`)
// stays until its genericisation in phase 4.5. Imported here, inside the type's
// own folder — never from `_shared`.
import ConfigureDrawer from '../../EnvironmentCard/ConfigureDrawer';
import { hasMissingRequiredConfigs } from '../_shared/configStatus';

/**
 * Automation's left-header slot: a Configure entry point.
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
  deployedCommitSha,
  releaseId,
  releaseMgtReleaseId,
  releaseMgtDeploymentId,
  buildId,
  deploymentStatusV2,
  onNotify,
}: HeaderStatusProps): ReactNode {
  const [configureOpen, setConfigureOpen] = useState(false);
  const { data: schemaConfig } = useSchemaConfig(projectId, component.id, envTemplateId, versionId, deployedCommitSha);
  const missingConfigs = useMemo(() => hasMissingRequiredConfigs(schemaConfig), [schemaConfig]);

  const deploying = deploymentStatusV2 === 'IN_PROGRESS';
  // A rollout over a workload this card has already seen running is a re-deploy (config change);
  // anything else — a first deploy, a promotion into this environment — is the initial one.
  const settledBefore = useRef(false);
  useEffect(() => {
    if (deploymentStatusV2 && deploymentStatusV2 !== 'IN_PROGRESS' && deploymentStatusV2 !== 'NOT_DEPLOYED') settledBefore.current = true;
  }, [deploymentStatusV2]);

  if (!hasDeployment && !deploying) return null;

  return (
    <>
      {deploying && (
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ flexShrink: 0 }}>
          <CircularProgress size={14} sx={{ color: 'warning.main' }} />
          <Typography variant="body2" color="text.secondary">
            {settledBefore.current ? 'Re-deploying' : 'Deploying'}
          </Typography>
        </Stack>
      )}
      {hasDeployment && <ConfigureButton onClick={() => setConfigureOpen(true)} hasMissingConfigs={missingConfigs} />}
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
        isAutomation
        envTemplateId={envTemplateId}
        buildId={buildId}
      />
    </>
  );
}
