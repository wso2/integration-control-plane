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

import { describe, expect, it } from 'vitest';
import type { DeploymentPipeline, EnvTemplate, PromotionTreeNode } from '../types/deploymentPipeline';
import { buildPromotionTree, flattenPromotionTree, isEnvInPipeline, PIPELINE_NAME_MAX_LENGTH, pinDefaultFirst, promotionTargetsFor, validatePipelineName } from './deploymentPipeline';

const makePipeline = (overrides: Partial<DeploymentPipeline>): DeploymentPipeline => ({
  id: 'p1',
  created_at: '2026-01-01T00:00:00Z',
  organization_uuid: 'org-1',
  name: 'Pipeline 1',
  promotion_tree: { name: 'Root', children: [] },
  ...overrides,
});

const makeEnv = (overrides: Partial<EnvTemplate>): EnvTemplate => ({
  id: 'env-1',
  env_name: 'Dev',
  region: 'us',
  choreo_env: 'dev',
  cluster_id: 'cluster-1',
  critical: false,
  dns_prefix: 'dev',
  ...overrides,
});

describe('validatePipelineName', () => {
  it('rejects an empty or whitespace-only name', () => {
    expect(validatePipelineName('', [])).toBe('Pipeline name is required');
    expect(validatePipelineName('   ', [])).toBe('Pipeline name is required');
  });

  it('rejects a name longer than the max length', () => {
    const longName = 'a'.repeat(PIPELINE_NAME_MAX_LENGTH + 1);
    expect(validatePipelineName(longName, [])).toBe(`Pipeline name must be at most ${PIPELINE_NAME_MAX_LENGTH} characters`);
  });

  it('accepts a name exactly at the max length', () => {
    const exactName = 'a'.repeat(PIPELINE_NAME_MAX_LENGTH);
    expect(validatePipelineName(exactName, [])).toBeNull();
  });

  it('rejects a name that duplicates an existing pipeline', () => {
    const existing = [makePipeline({ id: 'p1', name: 'Prod' })];
    expect(validatePipelineName('Prod', existing)).toBe('A pipeline with this name already exists');
  });

  it('allows a duplicate name when it belongs to the pipeline being edited', () => {
    const existing = [makePipeline({ id: 'p1', name: 'Prod' })];
    expect(validatePipelineName('Prod', existing, 'p1')).toBeNull();
  });

  it('trims the name before validating', () => {
    const existing = [makePipeline({ id: 'p1', name: 'Prod' })];
    expect(validatePipelineName('  Prod  ', existing, 'p1')).toBeNull();
  });

  it('returns null for a valid unique name', () => {
    expect(validatePipelineName('New Pipeline', [])).toBeNull();
  });
});

describe('pinDefaultFirst', () => {
  it('moves the default pipeline to the front', () => {
    const p1 = makePipeline({ id: 'p1', is_default: false });
    const p2 = makePipeline({ id: 'p2', is_default: true });
    const p3 = makePipeline({ id: 'p3', is_default: false });
    const result = pinDefaultFirst([p1, p2, p3], (p) => !!p.is_default);
    expect(result.map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
  });

  it('keeps relative order stable when none are default', () => {
    const p1 = makePipeline({ id: 'p1' });
    const p2 = makePipeline({ id: 'p2' });
    const result = pinDefaultFirst([p1, p2], (p) => !!p.is_default);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('does not mutate the input array', () => {
    const p1 = makePipeline({ id: 'p1', is_default: false });
    const p2 = makePipeline({ id: 'p2', is_default: true });
    const input = [p1, p2];
    pinDefaultFirst(input, (p) => !!p.is_default);
    expect(input.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('handles an empty pipeline list', () => {
    expect(pinDefaultFirst([], (p) => !!p.is_default)).toEqual([]);
  });

  it('uses the provided isDefault selector, e.g. is_project_default', () => {
    const p1 = makePipeline({ id: 'p1', is_project_default: false });
    const p2 = makePipeline({ id: 'p2', is_project_default: true });
    const result = pinDefaultFirst([p1, p2], (p) => !!p.is_project_default);
    expect(result.map((p) => p.id)).toEqual(['p2', 'p1']);
  });
});

describe('buildPromotionTree', () => {
  it('returns an empty-children root for an empty list', () => {
    expect(buildPromotionTree([])).toEqual({ name: 'Root', children: [] });
  });

  it('builds a single-level tree for one env', () => {
    const envs = [makeEnv({ id: 'e1', env_name: 'Dev' })];
    expect(buildPromotionTree(envs)).toEqual({
      name: 'Root',
      children: [{ env_template_id: 'e1', env_name: 'Dev' }],
    });
  });

  it('builds a linear chain for multiple envs', () => {
    const envs = [makeEnv({ id: 'e1', env_name: 'Dev' }), makeEnv({ id: 'e2', env_name: 'Staging' }), makeEnv({ id: 'e3', env_name: 'Prod' })];
    expect(buildPromotionTree(envs)).toEqual({
      name: 'Root',
      children: [
        {
          env_template_id: 'e1',
          env_name: 'Dev',
          children: [
            {
              env_template_id: 'e2',
              env_name: 'Staging',
              children: [{ env_template_id: 'e3', env_name: 'Prod' }],
            },
          ],
        },
      ],
    });
  });
});

describe('flattenPromotionTree', () => {
  it('returns an empty array for null or undefined trees', () => {
    expect(flattenPromotionTree(null)).toEqual([]);
    expect(flattenPromotionTree(undefined)).toEqual([]);
  });

  it('returns an empty array for a tree with no children', () => {
    expect(flattenPromotionTree({ name: 'Root', children: [] })).toEqual([]);
  });

  it('flattens a linear chain in order', () => {
    const tree: PromotionTreeNode = {
      name: 'Root',
      children: [
        {
          env_template_id: 'e1',
          env_name: 'Dev',
          children: [{ env_template_id: 'e2', env_name: 'Staging' }],
        },
      ],
    };
    expect(flattenPromotionTree(tree)).toEqual([
      { envTemplateId: 'e1', envName: 'Dev' },
      { envTemplateId: 'e2', envName: 'Staging' },
    ]);
  });

  it('skips nodes missing an id or name but still walks their children', () => {
    const tree: PromotionTreeNode = {
      name: 'Root',
      children: [
        {
          env_name: 'Dev',
          children: [{ env_template_id: 'e2', env_name: 'Staging' }],
        },
      ],
    };
    expect(flattenPromotionTree(tree)).toEqual([{ envTemplateId: 'e2', envName: 'Staging' }]);
  });

  it('round-trips with buildPromotionTree', () => {
    const envs = [makeEnv({ id: 'e1', env_name: 'Dev' }), makeEnv({ id: 'e2', env_name: 'Prod' })];
    const tree = buildPromotionTree(envs);
    expect(flattenPromotionTree(tree)).toEqual([
      { envTemplateId: 'e1', envName: 'Dev' },
      { envTemplateId: 'e2', envName: 'Prod' },
    ]);
  });
});

// dev -> staging -> prod
const linearTree: PromotionTreeNode = {
  name: 'Root',
  children: [
    {
      env_template_id: 'development',
      env_name: 'Dev',
      children: [{ env_template_id: 'staging', env_name: 'Staging', children: [{ env_template_id: 'production', env_name: 'Prod' }] }],
    },
  ],
};

describe('promotionTargetsFor', () => {
  it('returns the next environment in a linear chain', () => {
    expect(promotionTargetsFor(linearTree, 'development')).toEqual(['staging']);
    expect(promotionTargetsFor(linearTree, 'staging')).toEqual(['production']);
  });

  it('returns every branch target, which flattenPromotionTree would collapse', () => {
    const branching: PromotionTreeNode = {
      name: 'Root',
      children: [
        {
          env_template_id: 'development',
          env_name: 'Dev',
          children: [
            { env_template_id: 'staging', env_name: 'Staging' },
            { env_template_id: 'qa', env_name: 'QA' },
          ],
        },
      ],
    };
    expect(promotionTargetsFor(branching, 'development')).toEqual(['staging', 'qa']);
  });

  it('returns nothing for the end of the chain', () => {
    expect(promotionTargetsFor(linearTree, 'production')).toEqual([]);
  });

  it('returns nothing for an environment the pipeline does not reference', () => {
    expect(promotionTargetsFor(linearTree, 'unknown')).toEqual([]);
  });

  it('handles an empty or absent pipeline', () => {
    // A single-environment pipeline produces no promotion paths at all, which is
    // what makes every hop invalid until the chain is extended.
    expect(promotionTargetsFor({ name: 'Root', children: [] }, 'development')).toEqual([]);
    expect(promotionTargetsFor(undefined, 'development')).toEqual([]);
    expect(promotionTargetsFor(null, 'development')).toEqual([]);
  });

  it('falls back to env_name when a node carries no template id', () => {
    const tree: PromotionTreeNode = {
      name: 'Root',
      children: [{ env_name: 'development', children: [{ env_name: 'production' }] }],
    };
    expect(promotionTargetsFor(tree, 'development')).toEqual(['production']);
  });

  it('terminates on a cyclic tree', () => {
    const a: PromotionTreeNode = { env_template_id: 'a', env_name: 'A' };
    const b: PromotionTreeNode = { env_template_id: 'b', env_name: 'B', children: [a] };
    a.children = [b];
    expect(promotionTargetsFor({ name: 'Root', children: [a] }, 'a')).toEqual(['b']);
    expect(isEnvInPipeline({ name: 'Root', children: [a] }, 'b')).toBe(true);
  });
});

describe('isEnvInPipeline', () => {
  it('finds environments at any position in the chain', () => {
    expect(isEnvInPipeline(linearTree, 'development')).toBe(true);
    expect(isEnvInPipeline(linearTree, 'production')).toBe(true);
  });

  it('distinguishes "end of chain" from "not in the pipeline"', () => {
    // Both have no targets, but only one warrants telling the user to edit the pipeline.
    expect(promotionTargetsFor(linearTree, 'production')).toEqual([]);
    expect(isEnvInPipeline(linearTree, 'production')).toBe(true);

    expect(promotionTargetsFor(linearTree, 'unknown')).toEqual([]);
    expect(isEnvInPipeline(linearTree, 'unknown')).toBe(false);
  });

  it('is false for an empty pipeline', () => {
    expect(isEnvInPipeline({ name: 'Root', children: [] }, 'development')).toBe(false);
    expect(isEnvInPipeline(undefined, 'development')).toBe(false);
  });
});
