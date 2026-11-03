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
import { fetchSamples } from '../api/samples';
import type { SamplesData } from '../types/samples';
import { ALLOWED_SAMPLE_TYPES, normalizeComponentType } from '../constants/integrations';

const DEFAULT_SAMPLES_URL = 'https://raw.githubusercontent.com/wso2/integration-samples/main/.metadata/samples.json';

export function useSamples() {
  return useQuery<SamplesData>({
    queryKey: ['samples'],
    queryFn: async ({ signal }) => {
      const url = window.API_CONFIG?.samplesUrl ?? DEFAULT_SAMPLES_URL;
      const rawData = await fetchSamples(url, signal);
      const samples = rawData.samples.filter((s) => ALLOWED_SAMPLE_TYPES.has(s.componentType));
      return {
        samples,
        featuredSamples: samples.slice(0, 3),
        uniqueTypes: Array.from(new Set(samples.map((s) => normalizeComponentType(s.componentType)))),
        uniqueBuildPacks: Array.from(new Set(samples.map((s) => s.buildPack))).sort(),
        uniqueTags: Array.from(new Set(samples.flatMap((s) => s.tags))).sort(),
      };
    },
    retry: 3,
    staleTime: 5 * 60 * 1000,
  });
}
