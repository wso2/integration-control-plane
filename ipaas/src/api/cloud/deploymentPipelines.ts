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
 * Cloud (OpenChoreo) deployment-pipeline API. Calls the ipaas-service BFF.
 *
 * Wired endpoints:
 *   GET/POST         /deploymentpipelines
 *   GET/PUT/DELETE   /deploymentpipelines/{name}
 *   GET              /environments                (source for synthesized env templates)
 *   GET/PUT          /projects/{name}             (single per-project pipeline ref)
 *
 * Two contract functions have no OpenChoreo equivalent and are adapted here:
 *   - fetchEnvTemplates: OpenChoreo has no environment-template concept; the
 *     promotion chain is built directly over environments, so each environment
 *     is projected into an EnvTemplate.
 *   - fetchPipelineDeletionEligibility: no BFF route; usage is derived from the
 *     project pipeline refs (a project can only reference one pipeline).
 *
 * A project references exactly one pipeline (OpenChoreo ProjectSpec.deploymentPipelineRef),
 * whereas the devant UI models many-per-project plus a default. The project
 * association writes below collapse that onto the single deploymentPipeline field.
 */

import type { CreateDeploymentPipelineRequest, DeploymentPipeline, EnvTemplate, PipelineDeletionEligibility, PromotionTreeNode } from '../../types/deploymentPipeline';
import { toHandler } from '../../utils/string';
import { bff, items, seg, type ListResponse } from './_client';
import { toEnvironment, type BffEnvironment } from './_environmentShape';

// _orgUuid / _orgNumericId are kept for devant contract parity; cloud derives
// the org from the access token instead of taking an id from the caller.

// OpenChoreo promotion refs are environment names. The BFF flattens each path to
// { sourceEnvironment, targetEnvironments[] }, while the frontend models a
// recursive promotion tree whose nodes key on env_template_id (also the env name,
// see fetchEnvTemplates). These two mappers translate between the shapes.
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
  deploymentPipeline?: string;
}

/**
 * Walk the promotion tree, emitting a path per node that has children.
 *
 * Refs come from `env_template_id`, which carries the environment slug. The
 * `?? env_name` fallback exists only for trees that predate the id — `env_name`
 * holds a *display label*, so anything resolved through the fallback is written to
 * the CR as-is and will not match an Environment.
 */
const treeToPromotionPaths = (tree: PromotionTreeNode | null | undefined): BffPromotionPath[] => {
  const paths: BffPromotionPath[] = [];
  const walk = (nodes: PromotionTreeNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      const source = node.env_template_id ?? node.env_name;
      const targets = (node.children ?? []).map((c) => c.env_template_id ?? c.env_name).filter((n): n is string => !!n);
      if (source && targets.length > 0) paths.push({ sourceEnvironment: source, targetEnvironments: targets });
      walk(node.children);
    }
  };
  // Walk from the root itself: the synthetic wrapper (name:'Root', no env) is
  // skipped by the source guard above, while a genuine root environment — if the
  // tree ever carries one — still contributes its outgoing edge.
  walk(tree ? [tree] : []);
  return paths;
};

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
const DEFAULT_PIPELINE_NAME = 'default';

const toDeploymentPipeline = (p: BffDeploymentPipeline): DeploymentPipeline => ({
  id: p.name,
  created_at: p.createdAt ?? '',
  organization_uuid: '',
  name: p.displayName || p.name,
  promotion_tree: promotionPathsToTree(p.promotionPaths ?? []),
  is_default: p.name === DEFAULT_PIPELINE_NAME,
});

/**
 * The environment to chain a brand-new one onto when the default pipeline has no
 * promotion paths yet. A single-environment pipeline stores no paths at all — a
 * path needs both ends — so the existing environment cannot be read back off the
 * pipeline and has to come from the environment list. Only unambiguous when
 * exactly one other environment exists.
 */
const soleOtherEnvironment = async (envSlug: string): Promise<string | undefined> => {
  const others = items(await bff.get<ListResponse<{ name: string }>>('/environments')).filter((e) => e.name !== envSlug);
  return others.length === 1 ? others[0].name : undefined;
};

/**
 * Add `envSlug` to the default pipeline's promotion chain, so a freshly created
 * environment is actually deployable — an environment outside every promotion
 * path can never be promoted into, and the BFF rejects the attempt with a 403.
 *
 * With an existing chain the insertion point is its terminal environment: the one
 * promoted *to* but never *from*. With no paths at all the chain is seeded from
 * the only other environment. Anything ambiguous — several terminals, or several
 * candidate sources for a seed — is left untouched: there is no single correct
 * answer and guessing would rewrite a topology someone built deliberately.
 *
 * Returns whether the pipeline was updated.
 */
export const appendEnvironmentToDefaultPipeline = async (envSlug: string): Promise<boolean> => {
  const pipeline = items(await bff.get<ListResponse<BffDeploymentPipeline>>('/deploymentpipelines')).find((p) => p.name === DEFAULT_PIPELINE_NAME);
  if (!pipeline) return false;

  const paths = pipeline.promotionPaths ?? [];
  const sources = new Set(paths.map((p) => p.sourceEnvironment));
  const targets = new Set(paths.flatMap((p) => p.targetEnvironments));
  if (sources.has(envSlug) || targets.has(envSlug)) return false; // already in the chain

  // Extend an existing chain from its single terminal; with no paths at all there
  // is no terminal to read, so seed the chain from the only other environment.
  const terminals = [...targets].filter((t) => !sources.has(t));
  const source = paths.length === 0 ? await soleOtherEnvironment(envSlug) : terminals.length === 1 ? terminals[0] : undefined;
  if (!source) return false;

  await bff.put<BffDeploymentPipeline>(`/deploymentpipelines/${seg(pipeline.name)}`, {
    promotionPaths: [...paths, { sourceEnvironment: source, targetEnvironments: [envSlug] }],
  });
  return true;
};

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

export const fetchOrgDeploymentPipelines = (_orgUuid: string): Promise<DeploymentPipeline[]> => bff.get<ListResponse<BffDeploymentPipeline>>('/deploymentpipelines').then((r) => items(r).map(toDeploymentPipeline));

// A project references at most one pipeline; return it as a single-item list.
// Read errors propagate: an unavailable BFF must not be reported to the UI as
// "no pipeline configured", which is what a swallowed error would look like.
export const fetchProjectDeploymentPipelines = async (_orgUuid: string, projectId: string): Promise<DeploymentPipeline[]> => {
  const project = await bff.get<BffProject>(`/projects/${seg(projectId)}`);
  if (!project?.deploymentPipeline) return [];
  const pipeline = await bff.get<BffDeploymentPipeline>(`/deploymentpipelines/${seg(project.deploymentPipeline)}`);
  return [{ ...toDeploymentPipeline(pipeline), is_project_default: true }];
};

// is_default is dropped: OpenChoreo has no default flag, and the required K8s
// name is slugged from the label (which rides along as displayName).
export const createDeploymentPipeline = (_orgUuid: string, input: CreateDeploymentPipelineRequest): Promise<DeploymentPipeline> =>
  bff.post<BffDeploymentPipeline>('/deploymentpipelines', { name: toHandler(input.name), displayName: input.name, promotionPaths: treeToPromotionPaths(input.promotion_tree) }).then(toDeploymentPipeline);

export const updateDeploymentPipeline = (_orgUuid: string, pipelineId: string, input: CreateDeploymentPipelineRequest): Promise<DeploymentPipeline> =>
  bff.put<BffDeploymentPipeline>(`/deploymentpipelines/${seg(pipelineId)}`, { displayName: input.name, promotionPaths: treeToPromotionPaths(input.promotion_tree) }).then(toDeploymentPipeline);

export const deleteDeploymentPipeline = (_orgUuid: string, pipelineId: string): Promise<void> => bff.delete<void>(`/deploymentpipelines/${seg(pipelineId)}`).then(() => undefined);

// derives: no BFF deletion-eligibility route — infer usage from project pipeline refs.
export const fetchPipelineDeletionEligibility = async (_orgUuid: string, pipelineId: string): Promise<PipelineDeletionEligibility> => {
  const used = items(await bff.get<ListResponse<BffProject>>('/projects')).filter((p) => p.deploymentPipeline === pipelineId);
  return {
    id: pipelineId,
    name: pipelineId,
    isDeletable: used.length === 0,
    usedProjects: used.map((p) => ({ id: p.name, name: p.displayName || p.name, handler: p.name })),
  };
};

// A project holds a single pipeline ref. The multi-select UI sends a full
// replacement list; the last entry (the just-added one) wins. Return only what
// was actually persisted so callers aren't misled into thinking several
// pipelines stuck. An empty list is a no-op — the BFF's omitempty project update
// cannot unset the ref, so there is nothing to persist.
export const updateProjectDeploymentPipelines = async (_orgUuid: string, projectId: string, deploymentPipelineIds: string[]): Promise<string[]> => {
  const deploymentPipeline = deploymentPipelineIds[deploymentPipelineIds.length - 1];
  if (!deploymentPipeline) return [];
  await bff.put(`/projects/${seg(projectId)}`, { deploymentPipeline });
  return [deploymentPipeline];
};

export const setDefaultProjectDeploymentPipeline = async (_orgUuid: string, projectId: string, defaultDeploymentPipelineId: string): Promise<string> => {
  await bff.put(`/projects/${seg(projectId)}`, { deploymentPipeline: defaultDeploymentPipelineId });
  return defaultDeploymentPipelineId;
};
