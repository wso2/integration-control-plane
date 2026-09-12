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

/**
 * Environment ids in promotion order — depth-first from each root of the pipeline's
 * tree, deduped so a branch that rejoins is ranked by its first appearance.
 */
export function pipelineEnvOrder(tree?: PromotionTreeNode | null): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (node: PromotionTreeNode): void => {
    const id = node.env_template_id ?? node.env_name;
    if (id && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
    node.children?.forEach(walk);
  };
  // The tree's root is a synthetic 'Root' holding the real first environments.
  tree?.children?.forEach(walk);
  return order;
}

/**
 * Order environments along the pipeline's promotion chain, so index 0 is the first
 * deploy target and promotion runs left to right. Environments outside the chain keep
 * their relative order and sit last — a freshly created one belongs to no pipeline yet.
 */
export function orderEnvironmentsByPipeline<T extends { id: string }>(environments: T[], tree?: PromotionTreeNode | null): T[] {
  const rank = new Map(pipelineEnvOrder(tree).map((id, index) => [id, index]));
  if (rank.size === 0) return environments;
  const last = rank.size;
  return [...environments].sort((a, b) => (rank.get(a.id) ?? last) - (rank.get(b.id) ?? last));
}

/**
 * The environments a project can actually deploy to: the members of its pipeline's promotion
 * chain, in promotion order. Environments exist org-wide, so without this every project would
 * show every environment regardless of the pipeline it is bound to.
 *
 * A pipeline with no chain (or none resolved) restricts nothing — showing every environment is
 * the safer degradation, since an empty list reads as "nothing deployed".
 */
export function restrictEnvironmentsToPipeline<T extends { id: string }>(environments: T[], tree?: PromotionTreeNode | null): T[] {
  const chain = new Set(pipelineEnvOrder(tree));
  if (chain.size === 0) return environments;
  return orderEnvironmentsByPipeline(
    environments.filter((e) => chain.has(e.id)),
    tree,
  );
}
