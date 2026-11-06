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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deployByoiImage } from '../api/tailscale';
import { RAG_INGESTION_DEFAULT_IMAGE } from '../constants/ragIngestion';

/** The ingestion container image to deploy (runtime-config override, else the default). */
export function ragIngestionImage(): string {
  return window.API_CONFIG?.ragIngestionImage || RAG_INGESTION_DEFAULT_IMAGE;
}

/** Deploy (or re-deploy) a BYOI component's release with a specific image URL. */
export function useDeployByoiImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, releaseId, imageUrl }: { componentId: string; releaseId: string; imageUrl: string }) => deployByoiImage(componentId, releaseId, imageUrl),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['componentDeployment'] }),
  });
}
