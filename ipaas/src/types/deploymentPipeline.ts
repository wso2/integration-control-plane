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

/** An organization environment template — the building block a pipeline promotes through. */
export interface EnvTemplate {
  id: string;
  env_name: string;
  region: string;
  choreo_env: string;
  cluster_id: string;
  critical: boolean;
  dns_prefix: string;
}

/** A node in a pipeline's promotion tree. The root has `name: 'Root'`; each child carries an env. */
export interface PromotionTreeNode {
  env_template_id?: string;
  env_name?: string;
  name?: string;
  children?: PromotionTreeNode[];
}

/** A deployment (CD) pipeline — a named promotion path over environment templates. */
export interface DeploymentPipeline {
  id: string;
  created_at: string;
  organization_uuid: string;
  name: string;
  promotion_tree: PromotionTreeNode;
  /** Org-level default pipeline (org listing). */
  is_default?: boolean;
  /** Project-level default pipeline (project listing). */
  is_project_default?: boolean;
}

export interface CreateDeploymentPipelineRequest {
  name: string;
  promotion_tree: PromotionTreeNode;
}

/** A project that references a pipeline — surfaced when a delete is blocked. */
export interface PipelineProjectRef {
  id: string;
  name: string;
  handler: string;
}

export interface PipelineDeletionEligibility {
  id: string;
  name: string;
  isDeletable: boolean;
  usedProjects: PipelineProjectRef[];
}
