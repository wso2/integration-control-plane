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

import { useState, useCallback, useRef } from 'react';
import { useCreateComponent, useDeleteComponent } from './useComponents';
import { useDeployPrebuiltImage } from './useDeployments';
import { getOrgUuidFromToken } from '#auth';
import { componentSubTypeFromSample, displayTypeFromSample } from '../constants/integrations';
import { derivePrebuiltSlug } from '../utils/prebuilt';
import { checkNameAvailability, fetchComponentDetail, fetchFirstEnvironment, fetchLatestCommitSha, savePrebuiltConfig } from '#api/prebuilt';
import { IS_CLOUD } from '../features';
import { isQuotaError } from '../utils/apiErrors';
import type { DeployPrebuiltIntegrationInput, DeployPrebuiltIntegrationState } from '../types/prebuilt';

const IDLE_STATE: DeployPrebuiltIntegrationState = {
  progress: 0,
  stepLabel: '',
  error: null,
  errorSeverity: 'error',
  isDeploying: false,
  isSuccess: false,
  componentHandler: null,
  configSaveError: false,
};

export function useDeployPrebuiltIntegration() {
  const [state, setState] = useState<DeployPrebuiltIntegrationState>(IDLE_STATE);
  const createComponent = useCreateComponent();
  const deployImage = useDeployPrebuiltImage();
  const deleteComponent = useDeleteComponent();

  // Store mutations in refs so useCallback deps stay stable across renders
  const createComponentRef = useRef(createComponent);
  const deployImageRef = useRef(deployImage);
  const deleteComponentRef = useRef(deleteComponent);
  createComponentRef.current = createComponent;
  deployImageRef.current = deployImage;
  deleteComponentRef.current = deleteComponent;

  const deploy = useCallback(async (input: DeployPrebuiltIntegrationInput) => {
    const { integration, orgHandler, projectId, configValues } = input;
    setState({ progress: 0, stepLabel: 'Checking name availability…', error: null, errorSeverity: 'error', isDeploying: true, isSuccess: false, componentHandler: null, configSaveError: false });

    let createdComponentId: string | null = null;

    try {
      const slug = derivePrebuiltSlug(integration);
      setState((s) => ({ ...s, progress: 10 }));
      const uniqueName = await checkNameAvailability(projectId, slug);

      setState((s) => ({ ...s, progress: 20, stepLabel: 'Creating integration…' }));
      const displayType = displayTypeFromSample(integration.componentType, integration.buildPack);
      const component = await createComponentRef.current.mutateAsync({
        displayName: integration.displayName,
        name: uniqueName,
        description: integration.description,
        orgHandler,
        projectId,
        displayType,
        componentSubType: componentSubTypeFromSample(integration.componentType, integration.buildPack),
        srcGitRepoUrl: integration.repositoryUrl,
        repositorySubPath: integration.componentPath,
        repositoryBranch: integration.branch ?? 'main',
        isPublicRepo: true,
        enableAutoDeploy: false,
        isPrebuilt: true,
      });
      createdComponentId = component.id;

      setState((s) => ({ ...s, progress: 40, stepLabel: 'Fetching component details…' }));
      const detail = await fetchComponentDetail(projectId, component.handler);
      const deploymentTrackId = detail.deploymentTracks?.[0]?.id;
      if (!deploymentTrackId) throw new Error('No deployment track found for component');

      setState((s) => ({ ...s, progress: 55, stepLabel: 'Fetching environment…' }));
      const orgUuid = getOrgUuidFromToken() ?? '';
      const env = await fetchFirstEnvironment(orgUuid, projectId);
      if (!env.templateId) throw new Error('Environment has no template ID');

      if (configValues && configValues.length > 0) {
        setState((s) => ({ ...s, progress: 70, stepLabel: 'Saving configuration…' }));
        try {
          const sha = await fetchLatestCommitSha(detail.id, integration.branch ?? 'main');
          await savePrebuiltConfig(projectId, detail.id, env.templateId, deploymentTrackId, configValues, sha);
        } catch {
          setState((s) => ({ ...s, configSaveError: true }));
        }
      }

      setState((s) => ({ ...s, progress: 85, stepLabel: 'Deploying…' }));
      await deployImageRef.current.mutateAsync({
        componentId: detail.id,
        imageUrl: integration.imageUrl,
        appBranch: integration.branch ?? 'main',
        // Cloud-only: its BFF bakes these onto the Workload at creation (config
        // saved above is also kept for the Configure form). Devant's deploy
        // resolver doesn't ignore an unrecognized `configurations` field — it
        // 500s — so this must stay omitted outside of cloud.
        ...(IS_CLOUD ? { configurations: configValues } : {}),
      });

      setState((s) => ({ ...s, progress: 100, stepLabel: 'Deployed!', error: null, isDeploying: false, isSuccess: true, componentHandler: component.handler }));
    } catch (err) {
      // Log the primary failure before rolling back — otherwise the actual cause
      // (name check, create, deploy, …) is lost and only the generic toast remains.
      console.error('Prebuilt integration deploy failed', { orgHandler, projectId, createdComponentId }, err);
      if (createdComponentId) {
        try {
          await deleteComponentRef.current.mutateAsync({ orgHandler, componentId: createdComponentId, projectId });
        } catch (rollbackErr) {
          console.error('Failed to rollback component creation', { createdComponentId, orgHandler, projectId }, rollbackErr);
        }
      }
      // The BFF's wording names the resource and its limit, so a quota refusal is shown as sent.
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : 'Something went wrong while deploying the integration. Please try again.',
        errorSeverity: isQuotaError(err) ? 'warning' : 'error',
        isDeploying: false,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    createComponentRef.current.reset();
    deployImageRef.current.reset();
    deleteComponentRef.current.reset();
    setState(IDLE_STATE);
  }, []);

  return { deploy, reset, ...state };
}
