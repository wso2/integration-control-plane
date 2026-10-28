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

import { useQuery } from '@tanstack/react-query';
import type { PrebuiltIntegration } from '../types/prebuilt';
import type { JSONSchema } from '../types/schema';
import type { PrebuiltIntegrationsData, PrebuiltInstructionsResult, PrebuiltConfigSchemaResult, PrebuiltDiagramResult } from '../types/prebuilt';
import { DEFAULT_PREBUILT_INTEGRATIONS_URL } from '../constants/samples';
import { getDotChoreoBaseUrl } from '../utils/prebuilt';
import { fetchPrebuiltIntegrations, fetchPrebuiltAsset } from '../api/prebuilt';

export function usePrebuiltIntegrations() {
  return useQuery<PrebuiltIntegrationsData>({
    queryKey: ['prebuiltIntegrations'],
    queryFn: ({ signal }) => {
      const url = window.API_CONFIG?.prebuiltIntegrationsUrl ?? DEFAULT_PREBUILT_INTEGRATIONS_URL;
      return fetchPrebuiltIntegrations(url, signal);
    },
    retry: 3,
    staleTime: 5 * 60 * 1000,
  });
}

function usePrebuiltAsset<T>(integration: PrebuiltIntegration | null | undefined, queryKey: string, filename: string, parse: (res: Response) => Promise<T>): { data: T | undefined; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery<T>({
    queryKey: [queryKey, integration?.componentPath],
    queryFn: ({ signal }) => {
      const baseUrl = getDotChoreoBaseUrl(integration!);
      return fetchPrebuiltAsset(baseUrl, filename, signal).then(parse);
    },
    enabled: !!integration,
    retry: 3,
  });
  return { data, isLoading, isError };
}

export function usePrebuiltInstructions(integration: PrebuiltIntegration | null | undefined): PrebuiltInstructionsResult {
  const { data, isLoading, isError } = usePrebuiltAsset<string>(integration, 'prebuiltInstructions', 'instructions.md', (r) => r.text());
  return { instructions: data, isInstructionsLoading: isLoading, isInstructionsError: isError };
}

export function usePrebuiltConfigSchema(integration: PrebuiltIntegration | null | undefined): PrebuiltConfigSchemaResult {
  const { data, isLoading, isError } = usePrebuiltAsset<JSONSchema>(integration, 'prebuiltConfigSchema', 'config-schema.json', (r) => r.json() as Promise<JSONSchema>);
  return { configSchema: data, isConfigSchemaLoading: isLoading, isConfigSchemaError: isError };
}

export function usePrebuiltDiagram(integration: PrebuiltIntegration | null | undefined): PrebuiltDiagramResult {
  const { data, isLoading, isError } = usePrebuiltAsset<string>(integration, 'prebuiltDiagram', 'diagram.md', (r) => r.text());
  return { diagram: data, isDiagramLoading: isLoading, isDiagramError: isError };
}
