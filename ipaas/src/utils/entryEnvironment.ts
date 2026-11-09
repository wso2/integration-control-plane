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

import type { PromotionTreeNode } from '../types/deploymentPipeline';

/** The pipeline's entry environments: every environment directly under the tree's synthetic Root. */
export function entryEnvironmentIds(tree: PromotionTreeNode | null | undefined): string[] {
  return (tree?.children ?? []).map((node) => node.env_template_id ?? node.env_name).filter((id): id is string => !!id);
}

/**
 * Whether envId may edit endpoint visibility and API settings: only the pipeline's entry
 * environments do, and later environments get them by promotion. Entries are read from the
 * project's deployment pipeline, never from a position in an environment list, which loses
 * pipeline order when the pipeline can't be read.
 *
 * `undefined` pipelines (still loading) allow nothing, so an editor never flashes. With no pipeline
 * to read (none, or the read failed) every environment may edit and the BFF, which knows the entry
 * from the API Platform pipeline, refuses a change outside it with a message naming the entry.
 */
export function isEntryEnvironment(tree: PromotionTreeNode | null | undefined, envId: string): boolean {
  if (tree === undefined || !envId) return false;
  const entries = entryEnvironmentIds(tree);
  return entries.length === 0 || entries.includes(envId);
}
