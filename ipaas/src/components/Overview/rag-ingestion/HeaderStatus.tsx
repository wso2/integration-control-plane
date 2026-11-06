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

import { useState, type ReactNode } from 'react';
import type { HeaderStatusProps } from '../../../types/integration';
import StatusDot from '../_shared/StatusDot';
import ConfigureButton from '../_shared/ConfigureButton';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import RagIngestionConfigureDrawer, { type ConfigureStep } from './configure/RagIngestionConfigureDrawer';
import { KB_INGESTION_SUBTYPE } from '../../../constants/ragIngestion';

// A knowledge base's data source runs the image the platform deploys for it and
// reads no configuration file, so only its variables and schedule are editable.
const KB_DATA_SOURCE_STEPS: ConfigureStep[] = ['envVars', 'schedule'];

/**
 * RAG Ingestion's left-header slot: the deployment status dot plus a Configure
 * entry point that opens the 4-step BYOI Configure drawer (Environment
 * Variables, Configuration File, Schedule, Update Image) — matching devant.
 * A knowledge base's data source gets only the steps it can use.
 */
export default function HeaderStatus({ component, env, projectId, versionId, orgHandler, deploymentPipelineId, hasDeployment, deploymentStatusV2 }: HeaderStatusProps): ReactNode {
  const [configureOpen, setConfigureOpen] = useState(false);
  const can = useCan();

  return (
    <>
      <StatusDot status={deploymentStatusV2} />
      {/* The RAG drawer has no read-only view, so only roles that may change the configuration get it. */}
      {hasDeployment && can(Scopes.CONFIG_MANAGE) && (
        <>
          <ConfigureButton onClick={() => setConfigureOpen(true)} />
          <RagIngestionConfigureDrawer
            open={configureOpen}
            onClose={() => setConfigureOpen(false)}
            component={component}
            env={env}
            versionId={versionId}
            orgHandler={orgHandler}
            projectId={projectId}
            deploymentPipelineId={deploymentPipelineId}
            steps={component.componentSubType === KB_INGESTION_SUBTYPE ? KB_DATA_SOURCE_STEPS : undefined}
          />
        </>
      )}
    </>
  );
}
