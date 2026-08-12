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

import type { DeploymentPipeline, EnvTemplate, PromotionTreeNode } from '../types/deploymentPipeline';

/** Max pipeline-name length (matches Devant's limit). */
export const PIPELINE_NAME_MAX_LENGTH = 100;

/**
 * Validate a pipeline name against Devant's rules: required, within the length
 * limit, and unique across existing pipelines (excluding the one being edited).
 * Returns an error message, or null when valid.
 */
export function validatePipelineName(name: string, existingPipelines: DeploymentPipeline[], currentPipelineId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Pipeline name is required';
  if (trimmed.length > PIPELINE_NAME_MAX_LENGTH) return `Pipeline name must be at most ${PIPELINE_NAME_MAX_LENGTH} characters`;
  const duplicate = existingPipelines.some((p) => p.name === trimmed && p.id !== currentPipelineId);
  if (duplicate) return 'A pipeline with this name already exists';
  return null;
}

/**
 * Return pipelines with the default one pinned first; the rest keep their
 * original order (the sort is stable). `isDefault` selects which flag defines
 * "default" — org listings use `is_default`, project listings `is_project_default`.
 */
export function pinDefaultFirst(pipelines: DeploymentPipeline[], isDefault: (p: DeploymentPipeline) => boolean): DeploymentPipeline[] {
  return [...pipelines].sort((a, b) => Number(isDefault(b)) - Number(isDefault(a)));
}

/** An environment in a promotion chain. */
export interface PromotionEnv {
  envTemplateId: string;
  envName: string;
}

/**
 * Build a linear promotion tree (env[0] → env[1] → …) from an ordered list of
 * environment templates — the v1 shape the create/edit wizard produces.
 */
export function buildPromotionTree(orderedEnvs: EnvTemplate[]): PromotionTreeNode {
  const build = (index: number): PromotionTreeNode[] => {
    if (index >= orderedEnvs.length) return [];
    const env = orderedEnvs[index];
    const children = build(index + 1);
    return [{ env_template_id: env.id, env_name: env.env_name, ...(children.length > 0 ? { children } : {}) }];
  };
  return { name: 'Root', children: build(0) };
}

/**
 * Flatten a promotion tree into its ordered env chain (depth-first; the Root is
 * excluded). Nodes missing an id/name are skipped rather than coerced.
 */
export function flattenPromotionTree(tree: PromotionTreeNode | null | undefined): PromotionEnv[] {
  const out: PromotionEnv[] = [];
  const walk = (nodes: PromotionTreeNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.env_template_id && node.env_name) {
        out.push({ envTemplateId: node.env_template_id, envName: node.env_name });
      }
      walk(node.children);
    }
  };
  walk(tree?.children);
  return out;
}

/** A node's environment id. Matches the `env.templateId ?? env.id` join used elsewhere. */
const nodeEnvId = (node: PromotionTreeNode): string | undefined => node.env_template_id ?? node.env_name;

/**
 * Visit every node below the synthetic Root, skipping any node already seen so a
 * cyclic tree (see promotionPathsToTree's own cycle guard) cannot hang the walk.
 */
function walkPromotionNodes(tree: PromotionTreeNode | null | undefined, visit: (node: PromotionTreeNode, envId: string) => boolean | void): void {
  const seen = new Set<string>();
  const walk = (nodes: PromotionTreeNode[] | undefined): boolean => {
    for (const node of nodes ?? []) {
      const envId = nodeEnvId(node);
      if (!envId || seen.has(envId)) continue;
      seen.add(envId);
      if (visit(node, envId) === true) return true;
      if (walk(node.children)) return true;
    }
    return false;
  };
  walk(tree?.children);
}

/**
 * The environments `envId` may be promoted to, per the pipeline.
 *
 * Deliberately walks the tree's edges rather than reusing flattenPromotionTree,
 * which is a depth-first flatten that collapses branches and so loses exactly the
 * source→target relationship this needs. An empty result means either "not in the
 * pipeline" or "end of the chain" — use isEnvInPipeline to tell those apart, since
 * they warrant different UI.
 */
export function promotionTargetsFor(tree: PromotionTreeNode | null | undefined, envId: string): string[] {
  let targets: string[] = [];
  walkPromotionNodes(tree, (node, id) => {
    if (id !== envId) return;
    targets = (node.children ?? []).map(nodeEnvId).filter((t): t is string => !!t);
    return true;
  });
  return targets;
}

/** Whether the pipeline references `envId` at all, at any position in the chain. */
export function isEnvInPipeline(tree: PromotionTreeNode | null | undefined, envId: string): boolean {
  let found = false;
  walkPromotionNodes(tree, (_node, id) => {
    if (id !== envId) return;
    found = true;
    return true;
  });
  return found;
}
