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
 * Cloud (OpenChoreo) deployment-pipeline reads. Calls the ipaas-service BFF.
 *
 * Wired endpoints:
 *   GET   /deploymentpipelines/{name}
 *   GET   /environments                (source for synthesized env templates)
 *   GET   /projects/{name}             (single per-project pipeline ref)
 *
 * A project references exactly one pipeline (OpenChoreo ProjectSpec.deploymentPipelineRef),
 * whereas the devant UI models many-per-project plus a default.
 */

import type { DeploymentPipeline, EnvTemplate, PromotionTreeNode } from '../types/deploymentPipeline';
import { bff, items, seg, type ListResponse } from './_client';
import { toEnvironment, type BffEnvironment } from './_environmentShape';

// _orgUuid / _orgNumericId are kept for devant contract parity; cloud derives
// the org from the access token instead of taking an id from the caller.

// OpenChoreo promotion refs are environment names. The BFF flattens each path to
// { sourceEnvironment, targetEnvironments[] }, while the frontend models a
// recursive promotion tree whose nodes key on env_template_id (also the env name,
// see fetchEnvTemplates).
interface BffPromotionPath {
  sourceEnvironment: string;
  targetEnvironments: string[];
}

interface BffDeploymentPipeline {
  uid?: string;
  name: string;
  displayName?: string;
  description?: string;
  promotionPaths?: BffPromotionPath[];
  createdAt?: string;
}

interface BffProject {
  name: string;
  displayName?: string;
  // The project response serves the pipeline ref as `defaultDeploymentPipelineId`; the
  // update request takes it back as `deploymentPipeline`. Read both, write the latter.
  defaultDeploymentPipelineId?: string;
  deploymentPipeline?: string;
}

/** Rebuild a promotion tree from the BFF's flat paths (root = source that is never a target). */
const promotionPathsToTree = (paths: BffPromotionPath[]): PromotionTreeNode => {
  const targetsOf = new Map<string, string[]>();
  const allTargets = new Set<string>();
  for (const p of paths) {
    targetsOf.set(p.sourceEnvironment, p.targetEnvironments);
    for (const t of p.targetEnvironments) allTargets.add(t);
  }
  const build = (name: string, seen: Set<string>): PromotionTreeNode => {
    // env_name mirrors the name; consumers re-derive the display label from the
    // env-template list by id, so the value here only needs to round-trip.
    const node: PromotionTreeNode = { env_template_id: name, env_name: name };
    if (seen.has(name)) return node; // guard against a cyclic promotion path
    const next = new Set(seen).add(name);
    const children = (targetsOf.get(name) ?? []).map((t) => build(t, next));
    if (children.length > 0) node.children = children;
    return node;
  };
  const roots = [...targetsOf.keys()].filter((s) => !allTargets.has(s));
  return { name: 'Root', children: roots.map((r) => build(r, new Set())) };
};

// OpenChoreo has no default flag; the well-known "default" pipeline stands in.
export const DEFAULT_PIPELINE_NAME = 'default';

const toDeploymentPipeline = (p: BffDeploymentPipeline): DeploymentPipeline => ({
  id: p.name,
  created_at: p.createdAt ?? '',
  organization_uuid: '',
  name: p.displayName || p.name,
  promotion_tree: promotionPathsToTree(p.promotionPaths ?? []),
  is_default: p.name === DEFAULT_PIPELINE_NAME,
});

// OpenChoreo models no environment templates — the promotion chain is built over
// environments directly, so each environment is projected into an EnvTemplate.
export const fetchEnvTemplates = (_orgNumericId: number): Promise<EnvTemplate[]> =>
  bff.get<ListResponse<BffEnvironment>>('/environments').then((r) =>
    items(r)
      .map(toEnvironment)
      .map((e) => ({
        id: e.id,
        env_name: e.name,
        critical: e.critical,
        region: '',
        choreo_env: '',
        cluster_id: '',
        dns_prefix: '',
      })),
  );

export const fetchDeploymentPipeline = (name: string): Promise<DeploymentPipeline> => bff.get<BffDeploymentPipeline>(`/deploymentpipelines/${seg(name)}`).then(toDeploymentPipeline);

// A project references at most one pipeline; return it as a single-item list.
// Read errors propagate: an unavailable BFF must not be reported to the UI as
// "no pipeline configured", which is what a swallowed error would look like.
export const fetchProjectDeploymentPipelines = async (_orgUuid: string, projectId: string): Promise<DeploymentPipeline[]> => {
  const project = await bff.get<BffProject>(`/projects/${seg(projectId)}`);
  const pipelineName = project?.defaultDeploymentPipelineId || project?.deploymentPipeline;
  if (!pipelineName) return [];
  const pipeline = await bff.get<BffDeploymentPipeline>(`/deploymentpipelines/${seg(pipelineName)}`);
  return [{ ...toDeploymentPipeline(pipeline), is_project_default: true }];
};
