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

/**
 * Cloud samples API. The samples catalog is static JSON on a public URL
 * (window.API_CONFIG.samplesUrl, GitHub raw by default) with no backend
 * involvement, so the implementation is identical to devant's.
 */

import type { Sample } from '../types/samples';

export async function fetchSamples(url: string, signal?: AbortSignal): Promise<{ samples: Sample[] }> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const data = (await response.json()) as { samples: Sample[] };
  if (!Array.isArray(data?.samples)) throw new Error('Invalid response format: missing samples array');
  return data;
}
