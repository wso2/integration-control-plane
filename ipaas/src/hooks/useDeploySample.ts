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

import { useCallback } from 'react';
import { useCreateComponent } from './useComponents';
import { useDeployPrebuiltIntegration } from './useDeployPrebuiltIntegration';
import { componentSubTypeFromSample, displayTypeFromSample, sampleId, samplePath } from '../constants/integrations';
import { isQuotaError } from '../utils/apiErrors';
import { toHandler } from '../utils/string';
import type { Sample } from '../types/samples';

interface DeploySampleInput {
  sample: Sample;
  orgHandler: string;
  projectId: string;
  onSuccess: (componentHandler: string) => void;
  onError?: () => void;
}

/**
 * Creates a component from a sample. A sample that publishes an `imageUrl` is
 * deployed from that image, the same way a prebuilt integration is, so it is
 * running without waiting for a source build. A sample without one is built
 * from its repository.
 *
 * Both paths report through one state shape so callers can drive a single
 * IntegrationCreationLoader.
 */
export function useDeploySample() {
  const createComponent = useCreateComponent();
  const prebuilt = useDeployPrebuiltIntegration();
  const { deploy: deployPrebuilt, reset: resetPrebuilt } = prebuilt;
  const { mutate: createFromSource, reset: resetCreate } = createComponent;

  const deploy = useCallback(
    async ({ sample, orgHandler, projectId, onSuccess, onError }: DeploySampleInput) => {
      const componentPath = samplePath(sample);
      const creation = { method: 'from-sample', sampleId: sampleId(sample) } as const;

      if (sample.imageUrl) {
        const handler = await deployPrebuilt({
          integration: { ...sample, imageUrl: sample.imageUrl, componentPath },
          orgHandler,
          projectId,
          creation,
        });
        if (handler) onSuccess(handler);
        else onError?.();
        return;
      }

      createFromSource(
        {
          displayName: sample.displayName,
          name: toHandler(sample.displayName),
          description: sample.description,
          orgHandler,
          projectId,
          displayType: displayTypeFromSample(sample.componentType, sample.buildPack),
          componentSubType: componentSubTypeFromSample(sample.componentType, sample.buildPack),
          srcGitRepoUrl: sample.repositoryUrl,
          repositorySubPath: componentPath,
          repositoryBranch: sample.branch ?? 'main',
          isPublicRepo: true,
          enableAutoDeploy: true,
          creation,
        },
        {
          onSuccess: (component) => onSuccess(component.handler),
          onError: () => onError?.(),
        },
      );
    },
    [deployPrebuilt, createFromSource],
  );

  const reset = useCallback(() => {
    resetCreate();
    resetPrebuilt();
  }, [resetCreate, resetPrebuilt]);

  const createError = createComponent.isError ? (createComponent.error?.message ?? 'Something went wrong. Please try again.') : null;

  return {
    deploy,
    reset,
    isPending: createComponent.isPending || prebuilt.isDeploying,
    isSuccess: createComponent.isSuccess || prebuilt.isSuccess,
    error: createError ?? prebuilt.error,
    errorSeverity: createError ? (isQuotaError(createComponent.error) ? 'warning' : 'error') : prebuilt.errorSeverity,
    /**
     * The image deploy's real progress and step. A build from source has no
     * comparable steps, so these are undefined and the loader times its own.
     */
    progress: prebuilt.isDeploying ? prebuilt.progress : undefined,
    stepLabel: prebuilt.isDeploying ? prebuilt.stepLabel : undefined,
    /** True from the first deploy call until reset, so callers can swap in the progress view. */
    isActive: createComponent.isPending || createComponent.isSuccess || createComponent.isError || prebuilt.isDeploying || prebuilt.isSuccess || !!prebuilt.error,
  } as const;
}
