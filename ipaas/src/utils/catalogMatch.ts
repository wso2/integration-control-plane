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

import type { Repository } from '../types/repository';

const trimSlashes = (path: string): string => path.replace(/^\/+|\/+$/g, '');

/**
 * Finds the catalog entry (a sample or a prebuilt integration) a component was
 * created from, by matching its repository URL, its path in that repository and
 * its branch. Both catalogs are hosted on GitHub, so only GitHub repositories can
 * match. Paths are compared without leading or trailing slashes, since the catalog
 * and the component's repository each write them their own way.
 */
export function matchCatalogEntry<T extends { repositoryUrl: string; branch?: string }>(repository: Repository | null | undefined, entries: T[] | undefined, pathOf: (entry: T) => string): T | undefined {
  if (!entries?.length || !repository?.organizationApp || !repository?.nameApp || !repository?.appSubPath) return undefined;
  if (repository.gitProvider?.toLowerCase() !== 'github') return undefined;
  const repoUrl = `https://github.com/${repository.organizationApp}/${repository.nameApp}`;
  const path = trimSlashes(repository.appSubPath);
  return entries.find((entry) => entry.repositoryUrl.replace(/\/+$/, '') === repoUrl && trimSlashes(pathOf(entry)) === path && (repository.branch ? (entry.branch ?? 'main') === repository.branch : true));
}
