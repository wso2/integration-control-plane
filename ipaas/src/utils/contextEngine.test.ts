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
import {
  buildMcpClientConfig,
  buildMcpClientConfigs,
  buildQueryCurl,
  canShareApiKey,
  connectorCountsByCategory,
  effectiveLlm,
  fromDraft,
  getStartedSteps,
  graphStatusText,
  graphStatusTone,
  isFormDirty,
  modelsStepBlocker,
  splitCitations,
  suggestedQuestions,
  toDraft,
  engineDescriptionError,
  engineNameError,
  filterConnectors,
  grantAllowsQuery,
  invalidSourceFields,
  isFormComplete,
  isHttpUrl,
  isLlmValid,
  isNameStepValid,
  isSourceValid,
  isSourcesStepValid,
  resolveEngineBaseUrl,
  roleGrantId,
  rolesFromGrants,
  sourceFieldError,
  sourceIncompleteReason,
  sourceNameError,
  sourcesStepBlocker,
  splitUrls,
  summarizeSource,
  toConfigurationPayload,
  toCreateInput,
  toSourceRegistration,
} from './contextEngine';
import { blankLlm, blankSource, CONTEXT_ENGINE_NAME_MAX, SOURCE_CONNECTORS } from '../constants/contextEngine';
import type { ContextEngineDetail, ContextEngineForm, ContextGrant, ContextSourceConfig } from '../types/contextEngine';
import type { EmbeddingConfig } from '../types/ragIngestion';

const embedding: EmbeddingConfig = { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-test', azureApiVersion: '', azureBaseUrl: '' };

const withValues = (id: string, values: Record<string, string>, name?: string): ContextSourceConfig => {
  const blank = blankSource(id);
  return { ...blank, name: name ?? blank.name, values: { ...blank.values, ...values } };
};

function completeForm(): ContextEngineForm {
  const github = withValues('github', { repositoryUrl: 'https://github.com/wso2/docs', accessToken: 'ghp_x' });
  return {
    sources: [github],
    roles: ['admin'],
    embedding,
    llm: { ...blankLlm('anthropic'), model: 'claude-sonnet-4-6', apiKey: 'sk-ant' },
    shareApiKey: false,
    name: 'Support knowledge',
    description: 'Runbooks and docs',
  };
}

describe('url helpers', () => {
  it('accepts http(s) urls only', () => {
    expect(isHttpUrl('https://example.com/docs')).toBe(true);
    expect(isHttpUrl('http://localhost:3000')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });

  it('splits url lists on newlines and commas', () => {
    expect(splitUrls('https://a.com\n https://b.com ,, https://c.com\n')).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    expect(splitUrls('')).toEqual([]);
  });

  it('resolves a dev proxy path against the origin and leaves absolute urls alone', () => {
    expect(resolveEngineBaseUrl('/context-engine-proxy', 'https://localhost:3000/')).toBe('https://localhost:3000/context-engine-proxy');
    expect(resolveEngineBaseUrl('https://engine.example.com/', 'https://localhost:3000')).toBe('https://engine.example.com');
    expect(resolveEngineBaseUrl('', 'https://localhost:3000')).toBe('');
  });
});

describe('source validation', () => {
  it('validates a field by kind and required-ness', () => {
    const url = SOURCE_CONNECTORS.find((c) => c.id === 'github')!.fields.find((f) => f.key === 'repositoryUrl')!;
    expect(sourceFieldError(url, '')).toBe('Repository URL is required.');
    expect(sourceFieldError(url, 'nope')).toBe('Enter a full http(s) URL.');
    expect(sourceFieldError(url, 'https://github.com/o/r')).toBe('');
    const paths = SOURCE_CONNECTORS.find((c) => c.id === 'github')!.fields.find((f) => f.key === 'includePaths')!;
    expect(sourceFieldError(paths, '')).toBe(''); // optional
    const urls = SOURCE_CONNECTORS.find((c) => c.id === 'website')!.fields.find((f) => f.key === 'urls')!;
    expect(sourceFieldError(urls, 'https://a.com\nnot-a-url')).toBe('Not a valid URL: not-a-url');
  });

  it('requires the per-connector fields', () => {
    expect(isSourceValid(blankSource('gdrive'))).toBe(false);
    expect(isSourceValid(withValues('gdrive', { folderId: 'abc', apiKey: 'k' }))).toBe(true);
    expect(isSourceValid(withValues('website', { urls: 'https://a.com\nnot-a-url' }))).toBe(false);
    expect(isSourceValid(withValues('website', { urls: 'https://a.com' }))).toBe(true);
    expect(isSourceValid(blankSource('upload'))).toBe(true);
    expect(isSourceValid({ type: 'gone', name: 'x', values: {} })).toBe(false);
  });

  it('reports the first missing or invalid field and lists them in schema order', () => {
    const src = withValues('confluence', { baseUrl: 'bad-url', spaceKey: 'SUP' });
    expect(invalidSourceFields(src).map((f) => f.key)).toEqual(['baseUrl', 'email', 'apiToken']);
    expect(sourceIncompleteReason(src)).toBe('Base URL invalid');
    expect(sourceIncompleteReason(withValues('confluence', { baseUrl: 'https://x.atlassian.net/wiki' }))).toBe('Space Key missing');
    expect(sourceIncompleteReason(blankSource('upload'))).toBe('');
  });

  it('rejects empty and duplicate names', () => {
    expect(sourceNameError('  ', [])).not.toBe('');
    expect(sourceNameError('Docs', ['docs'])).not.toBe('');
    expect(sourceNameError('Docs', ['Other'])).toBe('');
    expect(isSourceValid({ ...blankSource('upload'), name: '  ' })).toBe(false);
  });

  it('explains why the step is blocked, in priority order', () => {
    expect(sourcesStepBlocker([])).toBe('Add at least one source to continue');
    const a = blankSource('upload');
    expect(sourcesStepBlocker([a])).toBeNull();
    expect(sourcesStepBlocker([a, { ...blankSource('upload') }])).toBe('Give each source a unique name');
    expect(sourcesStepBlocker([a, withValues('github', {}, 'Platform docs')])).toBe('Complete “Platform docs” to continue');
    expect(isSourcesStepValid([a, { ...blankSource('upload'), name: 'Second' }])).toBe(true);
  });
});

describe('catalog', () => {
  it('every connector has a unique id, a category and consistent summary keys', () => {
    const ids = new Set(SOURCE_CONNECTORS.map((c) => c.id));
    expect(ids.size).toBe(SOURCE_CONNECTORS.length);
    for (const c of SOURCE_CONNECTORS) {
      const keys = new Set(c.fields.map((f) => f.key));
      expect(keys.size).toBe(c.fields.length);
      for (const k of c.summaryKeys) expect(keys.has(k)).toBe(true);
    }
  });

  it('filters by query and category and sorts by name', () => {
    const git = filterConnectors(SOURCE_CONNECTORS, 'git', 'all').map((c) => c.id);
    expect(git).toEqual(['gitbook', 'github', 'gitlab']);
    expect(filterConnectors(SOURCE_CONNECTORS, '', 'databases').every((c) => c.category === 'databases')).toBe(true);
    expect(filterConnectors(SOURCE_CONNECTORS, 'zzz-nothing', 'all')).toEqual([]);
    const counts = connectorCountsByCategory(SOURCE_CONNECTORS);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(SOURCE_CONNECTORS.length);
  });

  it('blank sources carry field defaults and reject unknown ids', () => {
    expect(blankSource('github').values.branch).toBe('main');
    expect(blankSource('postgresql').values.port).toBe('5432');
    expect(() => blankSource('nope')).toThrow();
  });
});

describe('model validation', () => {
  it('requires model and key, plus base url + version for azure', () => {
    expect(isLlmValid(null)).toBe(false);
    expect(isLlmValid(blankLlm('openai'))).toBe(false);
    expect(isLlmValid({ ...blankLlm('openai'), model: 'gpt-4o', apiKey: 'k' })).toBe(true);
    const azure = { ...blankLlm('azure_openai'), model: 'dep', apiKey: 'k' };
    expect(isLlmValid(azure)).toBe(false);
    expect(isLlmValid({ ...azure, azureBaseUrl: 'https://r.openai.azure.com' })).toBe(true);
  });
});

describe('name step', () => {
  it('flags over-long and blank names, keeps empty as "no error yet"', () => {
    expect(engineNameError('')).toBe('');
    expect(engineNameError('   ')).not.toBe('');
    expect(engineNameError('a'.repeat(CONTEXT_ENGINE_NAME_MAX + 1))).not.toBe('');
    expect(engineNameError('Support knowledge')).toBe('');
    expect(engineDescriptionError('x'.repeat(1001))).not.toBe('');
    expect(isNameStepValid('', '')).toBe(false);
    expect(isNameStepValid('ok', '')).toBe(true);
  });
});

describe('form completion', () => {
  it('is complete only when every step passes', () => {
    const form = completeForm();
    expect(isFormComplete(form)).toBe(true);
    expect(isFormComplete({ ...form, sources: [] })).toBe(false);
    expect(isFormComplete({ ...form, llm: null })).toBe(false);
    expect(isFormComplete({ ...form, name: '' })).toBe(false);
  });

  it('roles are optional — the owner can keep an engine private', () => {
    expect(isFormComplete({ ...completeForm(), roles: [] })).toBe(true);
  });

  it('converts to a create input with trimmed name/description', () => {
    const input = toCreateInput({ ...completeForm(), name: '  Ops  ', description: ' d ' });
    expect(input.name).toBe('Ops');
    expect(input.description).toBe('d');
    expect(() => toCreateInput({ ...completeForm(), llm: null })).toThrow();
  });
});

describe('access helpers', () => {
  it('derives grant ids and recovers roles from group grants', () => {
    expect(roleGrantId('admin')).toBe('role-admin');
    expect(roleGrantId('Data Analyst')).toBe('role-Data-Analyst');
    const grants: ContextGrant[] = [
      { id: 'role-admin', resourceId: 's1', actions: ['context.read', 'evidence.read', 'trace.read'], group: 'admin' },
      { id: 'reader-read', resourceId: 's1', actions: ['context.read'], principalId: 'prn_1' },
      { id: 'role-ops', resourceId: 's1', actions: ['context.read'], group: 'ops' },
    ];
    expect(rolesFromGrants(grants)).toEqual(['admin', 'ops']);
    expect(grantAllowsQuery(grants[0])).toBe(true);
    expect(grantAllowsQuery(grants[2])).toBe(false);
  });
});

describe('wire payloads', () => {
  it('registers a source without credentials', () => {
    const src = completeForm().sources[0];
    expect(toSourceRegistration(src)).toEqual({ name: 'GitHub', type: 'github', audienceMapping: {} });
  });

  it('separates settings from credentials and adds azure fields only for azure', () => {
    const payload = toConfigurationPayload(toCreateInput(completeForm()));
    expect(payload.sources[0].settings).toEqual({ repositoryUrl: 'https://github.com/wso2/docs', branch: 'main', includePaths: '' });
    expect(payload.sources[0].credentials).toEqual({ accessToken: 'ghp_x' });
    expect(payload.llm).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-ant' });
    expect(payload.embedding.baseUrl).toBeUndefined();
  });

  it('summarizes sources for review', () => {
    expect(summarizeSource(withValues('amazons3', { bucketName: 'docs', prefix: 'kb/' }))).toBe('docs · kb/');
    expect(summarizeSource(withValues('website', { urls: 'https://a.com\nhttps://b.com' }))).toBe('2 URLs');
    expect(summarizeSource(blankSource('gdrive'))).toBe('Not configured yet');
    expect(summarizeSource(blankSource('upload'))).toBe('Upload files after the engine is created');
  });
});

describe('exposure snippets', () => {
  it('builds a curl against the queries route', () => {
    const curl = buildQueryCurl('https://engine.example.com', 'space-1');
    expect(curl).toContain('https://engine.example.com/v1/queries');
    expect(curl).toContain('"spaceId": "space-1"');
    expect(curl).toContain('Authorization: Bearer $TOKEN');
  });

  it('builds an mcp client config keyed by the engine name', () => {
    const cfg = JSON.parse(buildMcpClientConfig('https://engine.example.com/', 'space-1', 'Support Knowledge!'));
    expect(Object.keys(cfg.mcpServers)).toEqual(['support-knowledge']);
    expect(cfg.mcpServers['support-knowledge'].url).toBe('https://engine.example.com/v1/mcp');
  });
});

describe('shared api key', () => {
  it('only offers sharing when providers match and copies the key on submit', () => {
    const form = completeForm();
    expect(canShareApiKey(form.embedding, form.llm)).toBe(false); // openai vs anthropic
    const sameProvider: ContextEngineForm = { ...form, llm: { ...blankLlm('openai'), model: 'gpt-4.1', apiKey: '' }, shareApiKey: true };
    expect(canShareApiKey(sameProvider.embedding, sameProvider.llm)).toBe(true);
    expect(effectiveLlm(sameProvider)?.apiKey).toBe('sk-test');
    expect(modelsStepBlocker(sameProvider)).toBeNull();
    expect(modelsStepBlocker({ ...sameProvider, shareApiKey: false })).toBe('Complete the language model');
    expect(toCreateInput(sameProvider).llm.apiKey).toBe('sk-test');
  });

  it('names the first missing piece of the models step', () => {
    expect(modelsStepBlocker({ embedding: null, llm: null, shareApiKey: false })).toBe('Choose an embedding model');
    expect(modelsStepBlocker({ embedding, llm: null, shareApiKey: false })).toBe('Choose a language model');
  });
});

describe('drafts', () => {
  it('strips every secret and round-trips the rest', () => {
    const form = completeForm();
    const draft = toDraft(form, '2026-09-23T10:00:00Z');
    expect(draft.form.sources[0].values.accessToken).toBe('');
    expect(draft.form.sources[0].values.repositoryUrl).toBe('https://github.com/wso2/docs');
    expect(draft.form.embedding?.apiKey).toBe('');
    expect(draft.form.llm?.apiKey).toBe('');
    expect(draft.form.llm?.model).toBe('claude-sonnet-4-6');
    const restored = fromDraft(JSON.stringify(draft));
    expect(restored?.savedAt).toBe('2026-09-23T10:00:00Z');
    expect(restored?.form.name).toBe('Support knowledge');
    expect(restored?.form.roles).toEqual(['admin']);
  });

  it('rejects malformed or foreign drafts', () => {
    expect(fromDraft(null)).toBeNull();
    expect(fromDraft('not json')).toBeNull();
    expect(fromDraft(JSON.stringify({ v: 2, form: {} }))).toBeNull();
    expect(fromDraft(JSON.stringify({ v: 1, form: { name: 'x' } }))).toBeNull();
  });

  it('knows when there is nothing worth keeping', () => {
    expect(isFormDirty({ sources: [], roles: [], embedding: null, llm: null, shareApiKey: false, name: '', description: '  ' })).toBe(false);
    expect(isFormDirty({ ...completeForm(), sources: [], roles: [], embedding: null, llm: null, description: '' })).toBe(true); // name
  });
});

function engineDetail(over: Partial<ContextEngineDetail> = {}): ContextEngineDetail {
  return {
    id: 'spc_1',
    name: 'Support Knowledge',
    description: '',
    state: 'ready',
    createdAt: '2026-09-23T09:00:00Z',
    sources: [
      { id: 's1', name: 'Platform docs', type: 'github', state: 'ready' },
      { id: 's2', name: 'Support runbooks', type: 'confluence', state: 'ready' },
    ],
    models: { embedding: null, llm: null },
    queryRoles: [],
    exposure: { api: false, mcp: false },
    graph: { state: 'not_built' },
    ...over,
  };
}

describe('graph status and first run', () => {
  it('describes the graph state', () => {
    expect(graphStatusText({ state: 'not_built' })).toBe('Not built');
    expect(graphStatusText({ state: 'building', progress: { done: 2, total: 3 } })).toBe('Building · 2 of 3 sources');
    expect(graphStatusText({ state: 'built', builtAt: new Date(Date.now() - 5 * 60_000).toISOString() })).toMatch(/^Built /);
    expect(graphStatusText({ state: 'failed' })).toBe('Build failed');
    expect(graphStatusTone({ state: 'built' })).toBe('success');
    expect(graphStatusTone({ state: 'not_built' })).toBe('warning');
  });

  it('marks the first unfinished step current and the rest todo', () => {
    const steps = getStartedSteps(engineDetail(), false);
    expect(steps.map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(steps[0].description).toBe('Reads 2 sources and creates the graph answers are drawn from.');
    const later = getStartedSteps(engineDetail({ graph: { state: 'built' }, queryRoles: ['admin'] }), true);
    expect(later.map((s) => s.state)).toEqual(['done', 'done', 'current', 'done']);
    expect(later[3].description).toBe('1 role can query.');
  });
});

describe('playground helpers', () => {
  it('seeds suggestions from source names', () => {
    const qs = suggestedQuestions(engineDetail());
    expect(qs[0]).toBe('Summarize what is in Platform docs');
    expect(qs[1]).toBe('Summarize what is in Support runbooks');
    expect(qs.length).toBeLessThanOrEqual(4);
    expect(suggestedQuestions({ sources: [] })).toEqual(['What should a new team member read first?', 'Which documents mention rate limits or quotas?']);
  });

  it('splits [n] markers out of an answer', () => {
    expect(splitCitations('Redeploy the last release [1]. Confirm the checkpoint [2] first.')).toEqual([
      { kind: 'text', text: 'Redeploy the last release ' },
      { kind: 'cite', n: 1 },
      { kind: 'text', text: '. Confirm the checkpoint ' },
      { kind: 'cite', n: 2 },
      { kind: 'text', text: ' first.' },
    ]);
    expect(splitCitations('No markers here')).toEqual([{ kind: 'text', text: 'No markers here' }]);
  });
});

describe('mcp client configs', () => {
  it('shapes the same server for each client', () => {
    const cfgs = buildMcpClientConfigs('https://engine.example.com', 'spc_1', 'Support Knowledge');
    expect(cfgs.map((c) => c.id)).toEqual(['claude-desktop', 'cursor', 'vscode', 'generic']);
    const claude = JSON.parse(cfgs[0].json);
    expect(claude.mcpServers['support-knowledge'].url).toBe('https://engine.example.com/v1/mcp');
    const vscode = JSON.parse(cfgs[2].json);
    expect(vscode.servers['support-knowledge'].type).toBe('http');
    expect(cfgs[1].path).toBe('.cursor/mcp.json');
  });
});
