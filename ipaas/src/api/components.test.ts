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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock('./_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_client')>();
  return { ...actual, bff: { ...actual.bff, post, put } };
});

import { createComponent, updateEndpoint } from './components';
import type { CreateComponentInput } from '../types/component';

const baseInput: CreateComponentInput = {
  displayName: 'Task Agent',
  name: 'task-agent',
  description: 'does tasks',
  orgHandler: 'acme',
  projectId: 'proj',
  displayType: 'ballerinaService',
  srcGitRepoUrl: 'https://github.com/acme/bal-task-assistant',
  repositorySubPath: '/',
  repositoryBranch: 'main',
  isPublicRepo: true,
} as CreateComponentInput;

const bodyOf = () => post.mock.calls[0][1] as { spec: { componentType: { name: string }; workflow?: { name?: string } } };

describe('createComponent component-type mapping', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ handler: 'task-agent', componentType: 'aiAgent' });
  });

  it('creates an AI agent as an Agent Manager Platform-Hosted Agent', async () => {
    await createComponent({ ...baseInput, componentSubType: 'aiAgent' });
    // The BFF routes create/build/deploy/delete to agent-manager on this exact
    // string; 'deployment/ai-agent' would silently take the legacy path and
    // produce a component with no agent identity, traces or sandbox.
    expect(bodyOf().spec.componentType.name).toBe('proxy/agent-api');
  });

  it.each([
    ['ballerinaFileIntegration', 'deployment/file-integration'],
    ['miFileIntegration', 'deployment/mi-file-integration'],
  ])('leaves the %s sub-type on its own component type', async (subType, expected) => {
    await createComponent({ ...baseInput, componentSubType: subType } as CreateComponentInput);
    expect(bodyOf().spec.componentType.name).toBe(expected);
  });

  // deployment/mcp-server does not allow mi-image-builder; MI MCP servers need their own type.
  it.each([
    ['ballerinaService', 'deployment/mcp-server', 'ballerina-buildpack-builder'],
    ['miApiService', 'deployment/mi-mcp-server', 'mi-image-builder'],
  ])('creates a %s MCP server on %s with %s', async (displayType, componentType, workflow) => {
    await createComponent({ ...baseInput, displayType, componentSubType: 'MCP' } as CreateComponentInput);
    expect(bodyOf().spec.componentType.name).toBe(componentType);
    expect(bodyOf().spec.workflow?.name).toBe(workflow);
  });

  it.each([
    ['biService', 'ballerinaService'],
    ['miService', 'miApiService'],
  ])('reads a %s MCP server back as %s', async (bffDisplayType, displayType) => {
    post.mockResolvedValue({ handler: 'mcp', componentType: 'mcpServer', displayType: bffDisplayType });
    const created = await createComponent({ ...baseInput, componentSubType: 'MCP' } as CreateComponentInput);
    expect(created.displayType).toBe(displayType);
    expect(created.componentSubType).toBe('MCP');
  });

  it.each([
    ['miFileIntegration', 'ballerinaService', 'mi-image-builder'],
    ['ballerinaFileIntegration', 'miApiService', 'ballerina-buildpack-builder'],
  ])('builds %s with its own workflow despite a %s display type', async (subType, displayType, expected) => {
    await createComponent({ ...baseInput, displayType, componentSubType: subType } as CreateComponentInput);
    expect(bodyOf().spec.workflow?.name).toBe(expected);
  });

  it('leaves a plain integration on the display-type mapping', async () => {
    await createComponent(baseInput);
    expect(bodyOf().spec.componentType.name).toBe('deployment/integration-as-api');
  });

  // The mi-* types carry the MI resource defaults; the shared types' defaults OOMKill the MI JVM.
  it.each([
    ['miApiService', 'deployment/mi-integration-as-api'],
    ['miCronjob', 'cronjob/mi-scheduled-task'],
    ['miJob', 'cronjob/mi-scheduled-task'],
    ['miWebhook', 'deployment/mi-event-integration'],
    ['miEventHandler', 'deployment/mi-event-integration'],
  ])('creates the %s display type on its MI component type', async (displayType, expected) => {
    await createComponent({ ...baseInput, displayType } as CreateComponentInput);
    expect(bodyOf().spec.componentType.name).toBe(expected);
    expect(bodyOf().spec.workflow?.name).toBe('mi-image-builder');
  });
});

describe('updateEndpoint visibility reconciliation', () => {
  it('targets one environment and sends product-facing values', async () => {
    put.mockResolvedValue({});
    await updateEndpoint({
      projectId: 'project-a',
      componentId: 'orders',
      environmentId: 'development',
      versionId: 'v1',
      releaseId: 'r1',
      endpointId: 'http',
      displayName: 'HTTP',
      networkVisibilities: ['Project', 'Public'],
    });
    expect(put).toHaveBeenCalledWith('/components/orders/environments/development/endpoints/http/visibility?projectName=project-a', {
      visibility: ['project', 'public'],
      displayProjectUrl: true,
    });
  });

  it('keeps implicit project access while hiding its URL', async () => {
    put.mockResolvedValue({});
    await updateEndpoint({
      projectId: 'project-a',
      componentId: 'orders',
      environmentId: 'development',
      versionId: 'v1',
      releaseId: 'r1',
      endpointId: 'http',
      displayName: 'HTTP',
      networkVisibilities: ['Public'],
    });
    expect(put).toHaveBeenCalledWith('/components/orders/environments/development/endpoints/http/visibility?projectName=project-a', {
      visibility: ['project', 'public'],
      displayProjectUrl: false,
    });
  });
});
