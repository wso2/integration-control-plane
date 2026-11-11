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

import { act, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KnowledgeBases from './KnowledgeBases';
import KnowledgeBaseDetails from './KnowledgeBaseDetails';
import DeployButton from '../components/Overview/_shared/DeployButton';
import WorkflowRuntimeRow from '../components/Deploy/DeployEnvironmentCard/WorkflowRuntimeRow';
import { button, flush, reasonFor, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER, VIEWER } from '../test/roles';
import type { DeployActionProps } from '../types/integration';

const kb = vi.hoisted(() => ({
  name: 'docs',
  displayName: 'Docs',
  description: '',
  projectName: 'default',
  environment: 'development',
  config: {},
  secretKeys: [],
  status: 'ACTIVE',
  serviceUrl: '',
  createdAt: '',
  dataSources: [{ name: 'drive', displayName: 'Drive', config: {}, secretKeys: [], cronExpression: '', cronTimezone: '', status: 'ACTIVE', releaseName: 'drive-1', createdAt: '' }],
}));
const idle = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false };
vi.mock('react-router', async (importOriginal) => ({ ...(await importOriginal<typeof import('react-router')>()), useParams: () => ({ knowledgeBase: 'docs' }) }));
vi.mock('../hooks/useKnowledgeBases', () => ({
  useKnowledgeBases: () => ({ data: [kb] }),
  useKnowledgeBase: () => ({ data: kb, refetch: vi.fn() }),
  useUpdateKnowledgeBase: () => idle,
  useDeleteKnowledgeBase: () => idle,
  useRetrieveFromKnowledgeBase: () => ({ retrieve: idle, access: { keyError: null, needsApiKeyAuth: false, isUnavailable: false, gatewayUrl: 'https://gw/docs', isAuthorized: true } }),
}));
vi.mock('../hooks/useExecutions', () => ({ useTriggerComponent: () => idle, useTaskExecutions: () => ({ data: [] }) }));
vi.mock('../hooks/useComponents', () => ({ useDeleteComponent: () => idle }));
vi.mock('../hooks/useProjects', () => ({ useProjectByHandler: () => ({ data: undefined }) }));
vi.mock('../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('../hooks/useDeployments', () => ({
  useDeploymentTrackImages: () => ({ data: [{ imageId: 'image-2' }], isLoading: false }),
  useDeploymentStatus: () => ({ data: [] }),
  useDeployDeploymentTrack: () => idle,
}));
vi.mock('../hooks/useWorkflowRuntime', () => ({ useWorkflowRuntime: () => ({ data: { status: 'ERROR', namespaces: [] } }), useEnsureWorkflowRuntime: () => idle }));

let unmount = () => {};
afterEach(() => unmount());

async function open(ui: ReactNode, scopes: string[]) {
  const r = await renderWithScopes(<MemoryRouter>{ui}</MemoryRouter>, scopes);
  unmount = r.unmount;
  await flush();
  return r.container;
}

const org = { level: 'organizations', org: 'acme' } as const;
const click = (c: HTMLElement, name: string) => act(async () => button(c, name)?.click());
const openTab = (c: HTMLElement, label: string) => act(async () => [...c.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === label)?.click());
const offered = (c: HTMLElement, names: string[]) => names.filter((n) => button(c, n) || [...document.body.querySelectorAll('[role="menuitem"]')].some((m) => m.textContent === n));

/** Every write a role might be offered on a knowledge base's page, across its tabs. */
async function detailsWrites(scopes: string[]) {
  const c = await open(<KnowledgeBaseDetails {...org} />, scopes);
  await click(c, 'Actions for Drive');
  const overview = offered(c, ['Delete', 'Add Data Source', 'Ingest', 'Schedule']);
  await openTab(c, 'Configurations');
  const configuration = offered(c, ['Save']);
  await openTab(c, 'Retrieval');
  return { writes: [...overview, ...configuration], refusedRetrieval: c.textContent?.includes("Your role can't query knowledge bases.") };
}

describe('knowledge bases', () => {
  it('offers a Platform Engineer every write', async () => {
    expect(offered(await open(<KnowledgeBases {...org} />, PLATFORM_ENGINEER), ['Create Knowledge Base', 'Delete Docs'])).toHaveLength(2);
    unmount();
    expect(await detailsWrites(PLATFORM_ENGINEER)).toEqual({ writes: ['Delete', 'Add Data Source', 'Ingest', 'Schedule', 'Save'], refusedRetrieval: false });
  });

  it("offers a Developer, without cloud:resource-type:manage or ipaas:integration:delete, only a data source's Ingest and Schedule", async () => {
    expect(offered(await open(<KnowledgeBases {...org} />, DEVELOPER), ['Create Knowledge Base', 'Delete Docs'])).toEqual([]);
    unmount();
    expect(await detailsWrites(DEVELOPER)).toEqual({ writes: ['Ingest', 'Schedule'], refusedRetrieval: false });
  });

  it('offers a Viewer nothing, and says why retrieval is unavailable', async () => {
    expect(await detailsWrites(VIEWER)).toEqual({ writes: [], refusedRetrieval: true });
  });

  // The BFF refuses these with 409 while the create runs, and once it failed all but the delete.
  it.each([
    ['ACTIVE', { Delete: null, 'Add Data Source': null, Save: null }],
    ['CREATING', { Delete: 'The knowledge base is still being created. Try again once it is.', 'Add Data Source': 'The knowledge base is still being created. Try again once it is.', Save: 'The knowledge base is still being created. Try again once it is.' }],
    ['FAILED', { Delete: null, 'Add Data Source': 'The knowledge base could not be created. Delete it and create it again.', Save: 'The knowledge base could not be created. Delete it and create it again.' }],
  ])('holds back the writes a %s knowledge base would refuse, and says why', async (status, want) => {
    // Stored settings the form accepts as they are, so only the create's state can hold Save back.
    const stored = { config: kb.config, secretKeys: kb.secretKeys };
    kb.config = { VECTORDB_PROVIDER: 'pinecone', COLLECTION_NAME: 'docs', EMBEDDING_MODEL_PROVIDER: 'openai', EMBEDDING_MODEL: 'text-embedding-3-small' } as never;
    kb.secretKeys = ['PINECONE_APIKEY', 'EMBEDDING_MODEL_APIKEY'] as never;
    kb.status = status;
    try {
      const c = await open(<KnowledgeBaseDetails {...org} />, PLATFORM_ENGINEER);
      const state = (name: string) => (button(c, name)?.disabled ? reasonFor(button(c, name)) : null);
      const overview = { Delete: state('Delete'), 'Add Data Source': state('Add Data Source') };
      await openTab(c, 'Configurations');
      // The form says why above its Save, rather than in a tooltip.
      const save = button(c, 'Save')?.disabled ? ([...c.querySelectorAll('[role="alert"]')].map((a) => a.textContent).find((t) => t === want.Save) ?? 'no reason shown') : null;
      expect({ ...overview, Save: save }).toEqual(want);
    } finally {
      Object.assign(kb, stored, { status: 'ACTIVE' });
    }
  });
});

describe('workflow integrations', () => {
  const deployProps = { component: { id: 'flow' }, env: { id: 'development' }, versionId: 'main', buildId: 'image-1', onNotify: vi.fn(), requestPoll: vi.fn() } as unknown as DeployActionProps;

  it.each([
    ['a Developer', DEVELOPER, ['Deploy', 'Retry']],
    ['a Viewer', VIEWER, []],
  ])('offer Deploy and starting the workflow runtime to %s by role', async (_, scopes, expected) => {
    const c = await open(
      <>
        <DeployButton {...deployProps} />
        <WorkflowRuntimeRow environment="development" />
      </>,
      scopes,
    );
    expect(offered(c, ['Deploy', 'Retry'])).toEqual(expected);
  });
});
