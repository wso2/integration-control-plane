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
const get = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock('./_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_client')>();
  return { ...actual, bff: { ...actual.bff, post, get, put } };
});

import { createComponent, createDeploymentTrack, fetchComponentByHandler, updateDeploymentTrack } from './components';
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

describe('deployment tracks', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
    post.mockResolvedValue({ id: 'next-bbbbbb' });
    put.mockResolvedValue({ id: 'next-bbbbbb' });
  });

  it('reads the tracks from the component detail', async () => {
    get.mockResolvedValue({
      id: 'uid-1',
      handler: 'hello',
      deploymentTracksEnabled: true,
      deploymentTracks: [
        { id: 'main-aaaaaa', branch: 'main', latest: true },
        { id: 'next-bbbbbb', branch: 'next' },
      ],
    });
    const c = await fetchComponentByHandler('proj', 'hello');
    expect(get).toHaveBeenCalledWith('/projects/proj/components/hello');
    expect(c.deploymentTracks?.map((t) => t.id)).toEqual(['main-aaaaaa', 'next-bbbbbb']);
    expect(c.apiVersions?.map((v) => [v.id, v.branch, v.latest])).toEqual([
      ['main-aaaaaa', 'main', true],
      ['next-bbbbbb', 'next', false],
    ]);
  });

  // Pages key their track-scoped queries off a track id, so a component the BFF
  // reports no tracks for still gets one: its own id, which the BFF reads as the default.
  it('gives a component without tracks one track named by its id', async () => {
    get.mockResolvedValue({ id: 'uid-1', handler: 'hello' });
    const c = await fetchComponentByHandler('proj', 'hello');
    expect(c.deploymentTracks).toEqual([{ id: 'uid-1', latest: true }]);
  });

  // A BFF that predates the detail endpoint answers it with an empty stub.
  it('falls back to the list endpoint when the detail answer names no component', async () => {
    get.mockImplementation(async (path: string) => {
      if (path === '/projects/proj/components/hello') return { orgHandler: 'proj' };
      if (path === '/projects/proj/components') return { items: [{ id: 'uid-1', handler: 'hello', name: 'hello', displayType: 'ballerinaService' }] };
      if (path === '/components/hello/deployment-track') return { id: 'uid-1', branch: 'main', latest: true };
      throw new Error(`unexpected ${path}`);
    });
    const c = await fetchComponentByHandler('proj', 'hello');
    expect(c.id).toBe('uid-1');
    expect(c.handler).toBe('hello');
    expect(c.deploymentTracks).toEqual([{ id: 'uid-1', branch: 'main', latest: true, autoDeployEnabled: undefined }]);
    expect(c.apiVersions?.map((v) => [v.id, v.branch, v.latest])).toEqual([['uid-1', 'main', true]]);
  });

  it('keeps the fallback usable when the track lookup fails', async () => {
    get.mockImplementation(async (path: string) => {
      if (path === '/projects/proj/components/hello') return {};
      if (path === '/projects/proj/components') return { items: [{ id: 'uid-1', handler: 'hello', name: 'hello', displayType: 'ballerinaService' }] };
      throw new Error('HTTP 500');
    });
    const c = await fetchComponentByHandler('proj', 'hello');
    expect(c.deploymentTracks).toEqual([{ id: 'uid-1', branch: undefined, latest: true, autoDeployEnabled: undefined }]);
  });

  it('reports a component the list does not have', async () => {
    get.mockImplementation(async (path: string) => (path === '/projects/proj/components' ? { items: [] } : {}));
    await expect(fetchComponentByHandler('proj', 'hello')).rejects.toThrow('Component "hello" not found in project "proj"');
  });

  it('creates a track from a branch with its API version', async () => {
    await createDeploymentTrack({ orgUuid: 'org', componentId: 'hello', apiVersion: 'v1.1', branch: 'next', description: 'preview' });
    expect(post).toHaveBeenCalledWith('/components/hello/deployment-tracks', { branch: 'next', description: 'preview', enableAutoDeploy: undefined, apiVersion: 'v1.1' });
  });

  // JSON drops an undefined field, so the BFF assigns the version itself.
  it('leaves the API version out when none is given', async () => {
    await createDeploymentTrack({ orgUuid: 'org', componentId: 'hello', branch: 'next' });
    expect(JSON.parse(JSON.stringify(post.mock.calls[0][1]))).toEqual({ branch: 'next' });
  });

  it('updates a track in place', async () => {
    await updateDeploymentTrack({ componentId: 'hello', deploymentTrackId: 'next-bbbbbb', branch: 'release' });
    expect(put).toHaveBeenCalledWith('/components/hello/deployment-tracks/next-bbbbbb', expect.objectContaining({ branch: 'release' }));
    expect(JSON.parse(JSON.stringify(put.mock.calls[0][1]))).not.toHaveProperty('apiVersion');
  });

  it('sets the API version of a track that has none', async () => {
    await updateDeploymentTrack({ componentId: 'hello', deploymentTrackId: 'old-cccccc', apiVersion: 'v1.2' });
    expect(put).toHaveBeenCalledWith('/components/hello/deployment-tracks/old-cccccc', expect.objectContaining({ apiVersion: 'v1.2' }));
  });

  it("lists each track's API version", async () => {
    get.mockResolvedValue({
      id: 'uid-1',
      handler: 'hello',
      deploymentTracks: [
        { id: 'main-aaaaaa', branch: 'main', latest: true, apiVersion: 'v1.0' },
        { id: 'old-cccccc', branch: 'old' },
      ],
    });
    const c = await fetchComponentByHandler('proj', 'hello');
    expect(c.apiVersions?.map((v) => v.apiVersion)).toEqual(['v1.0', '']);
  });
});
