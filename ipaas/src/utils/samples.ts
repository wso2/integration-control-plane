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

import { sampleId } from '../constants/integrations';
import { matchCatalogEntry } from './catalogMatch';
import type { Repository } from '../types/repository';
import type { Sample } from '../types/samples';

/**
 * Match a component's git repository to a sample (repo URL + sample path +
 * branch), so the console can tell an integration created from a sample apart
 * from one the user brought. Returns undefined if no sample matches.
 */
export function matchSample(repository: Repository | null | undefined, samples: Sample[] | undefined): Sample | undefined {
  return matchCatalogEntry(repository, samples, sampleId);
}
