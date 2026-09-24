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
  formatProgressPercent,
  isEngineProgressActive,
  overallProgress,
  progressHeadline,
  progressListingText,
  sourceIndexingText,
  sourceProgressDetail,
  sourceProgressStatus,
  sourceProgressValue,
  sourceSyncText,
  summarizeEngineProgress,
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
  isGraphUri,
  modelsStepBlocker,
  sanitizeStorage,
  storageSelectionError,
  storageStepBlocker,
  summarizeStorage,
  toStoragePayload,
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
import { blankLlm, blankSource, CONTEXT_ENGINE_NAME_MAX, defaultStorage, SOURCE_CONNECTORS } from '../constants/contextEngine';
import type { ContextEngineDetail, ContextEngineForm, ContextGrant, ContextSourceConfig, SourceProgress } from '../types/contextEngine';
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
    storage: defaultStorage(),
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
    expect(isFormDirty({ sources: [], roles: [], embedding: null, llm: null, shareApiKey: false, storage: defaultStorage(), name: '', description: '  ' })).toBe(false);
    expect(isFormDirty({ sources: [], roles: [], embedding: null, llm: null, shareApiKey: false, storage: { ...defaultStorage(), vector: { mode: 'infrastructure', serverId: 's1', serverName: 'v', database: 'd' } }, name: '', description: '' })).toBe(true);
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
    storage: null,
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

describe('storage', () => {
  it('managed stores are always usable; infrastructure needs a server and a database', () => {
    expect(storageSelectionError('vector', { mode: 'managed' })).toBe('');
    expect(storageSelectionError('vector', { mode: 'infrastructure', serverId: '', serverName: '', database: '' })).toBe('Choose a vector database server, or switch to Engine managed');
    expect(storageSelectionError('relational', { mode: 'infrastructure', serverId: 's1', serverName: 'platform-db', database: ' ' })).toBe('Enter the database to use on platform-db');
    expect(storageSelectionError('relational', { mode: 'infrastructure', serverId: 's1', serverName: 'platform-db', database: 'context_engine' })).toBe('');
  });

  it('external graph needs a graph uri and full credentials', () => {
    expect(isGraphUri('bolt://graph.internal:7687')).toBe(true);
    expect(isGraphUri('neo4j+s://abc.databases.neo4j.io')).toBe(true);
    expect(isGraphUri('graph.internal:7687')).toBe(false);
    const ext = { mode: 'external' as const, uri: 'bolt://graph.internal:7687', database: 'neo4j', user: 'neo4j', password: 'pw' };
    expect(storageSelectionError('graph', ext)).toBe('');
    expect(storageSelectionError('graph', { ...ext, uri: 'nope' })).toBe('Enter a bolt://, neo4j:// or http(s):// URI');
    expect(storageSelectionError('graph', { ...ext, password: '' })).toBe('Enter the database, user and password');
  });

  it('the step blocker names the first incomplete store', () => {
    expect(storageStepBlocker(defaultStorage())).toBeNull();
    expect(storageStepBlocker({ ...defaultStorage(), relational: { mode: 'infrastructure', serverId: '', serverName: '', database: '' } })).toBe('Choose a database server, or switch to Engine managed');
  });

  it('summarizes each mode in two lines', () => {
    expect(summarizeStorage('graph', { mode: 'managed' })).toEqual({ primary: 'Engine managed', secondary: 'Kuzu · embedded' });
    expect(summarizeStorage('vector', { mode: 'infrastructure', serverId: 's1', serverName: 'support-vectors', database: 'context_vectors' })).toEqual({ primary: 'support-vectors', secondary: 'pgvector · context_vectors' });
    expect(summarizeStorage('graph', { mode: 'external', uri: 'bolt://graph.internal:7687', database: 'neo4j', user: 'u', password: 'p' })).toEqual({ primary: 'Neo4j', secondary: 'graph.internal:7687 · neo4j' });
  });

  it('maps to the engine payload and requires a resolved connection for infrastructure', () => {
    expect(toStoragePayload('relational', { mode: 'managed' })).toEqual({ provider: 'sqlite' });
    const infra = { mode: 'infrastructure' as const, serverId: 's1', serverName: 'platform-db', database: 'context_engine' };
    expect(() => toStoragePayload('relational', infra)).toThrow();
    expect(toStoragePayload('relational', infra, { host: 'h', port: '5432', user: 'admin', password: 'pw', sslRequired: true })).toEqual({
      provider: 'postgres',
      serverId: 's1',
      serverName: 'platform-db',
      host: 'h',
      port: '5432',
      database: 'context_engine',
      user: 'admin',
      password: 'pw',
      sslRequired: true,
    });
    const payload = toConfigurationPayload(toCreateInput({ ...completeForm(), storage: { ...defaultStorage(), graph: { mode: 'external', uri: 'bolt://g:7687', database: 'neo4j', user: 'u', password: 'p' } } }));
    expect(payload.storage.vector).toEqual({ provider: 'lancedb' });
    expect(payload.storage.graph).toEqual({ provider: 'neo4j', uri: 'bolt://g:7687', database: 'neo4j', user: 'u', password: 'p' });
  });

  it('sanitizes stored storage and strips the external password from drafts', () => {
    expect(sanitizeStorage(undefined)).toEqual(defaultStorage());
    expect(sanitizeStorage({ vector: { mode: 'infrastructure', serverId: 's1', serverName: 'v', database: 'd' }, graph: { mode: 'bogus' } })).toEqual({ ...defaultStorage(), vector: { mode: 'infrastructure', serverId: 's1', serverName: 'v', database: 'd' } });
    const form = { ...completeForm(), storage: { ...defaultStorage(), graph: { mode: 'external' as const, uri: 'bolt://g:7687', database: 'neo4j', user: 'u', password: 'secret' } } };
    const draft = toDraft(form, '2026-09-24T10:00:00Z');
    expect(draft.form.storage.graph).toEqual({ mode: 'external', uri: 'bolt://g:7687', database: 'neo4j', user: 'u', password: '' });
    expect(fromDraft(JSON.stringify(draft))?.form.storage.graph.mode).toBe('external');
  });
});

type ProgressOverrides = { [K in keyof SourceProgress]?: K extends 'sourceId' ? string : Partial<SourceProgress[K]> };

const progress = (o: ProgressOverrides = {}): SourceProgress => ({
  sourceId: o.sourceId ?? 'src_1',
  reading: { state: 'idle', ...o.reading },
  processing: { total: 0, queued: 0, running: 0, succeeded: 0, failed: 0, percent: null, ...o.processing },
  records: { active: 0, quarantined: 0, deleted: 0, ...o.records },
  indexing: { state: 'not_collected', expected: null, indexed: null, indexing: null, failed: null, missing: null, percent: null, ...o.indexing },
});

describe('source progress', () => {
  it('derives the pipeline status in priority order', () => {
    expect(sourceProgressStatus(progress())).toBe('waiting');
    expect(sourceProgressStatus(progress({ reading: { state: 'reading' }, processing: { total: 4, queued: 4, percent: 0 } }))).toBe('reading');
    expect(sourceProgressStatus(progress({ reading: { state: 'completed' }, processing: { total: 4, queued: 1, running: 1, succeeded: 2, percent: 50 } }))).toBe('processing');
    expect(sourceProgressStatus(progress({ reading: { state: 'completed' }, processing: { total: 4, succeeded: 4, percent: 100 }, records: { active: 4 }, indexing: { state: 'ok', expected: 4, indexed: 2, indexing: 2, percent: 50 } }))).toBe('indexing');
    expect(sourceProgressStatus(progress({ reading: { state: 'completed' }, processing: { total: 4, succeeded: 4, percent: 100 }, records: { active: 4 } }))).toBe('processed');
    expect(sourceProgressStatus(progress({ reading: { state: 'completed' }, processing: { total: 4, succeeded: 3, failed: 1, percent: 100 }, records: { active: 3 } }))).toBe('attention');
    expect(sourceProgressStatus(progress({ reading: { state: 'completed' }, processing: { total: 2, succeeded: 2, percent: 100 }, records: { active: 1, quarantined: 1 } }))).toBe('attention');
  });

  it('treats a finished sync with nothing new as processed, not waiting', () => {
    expect(sourceProgressStatus(progress({ reading: { state: 'completed' } }))).toBe('processed');
    expect(sourceProgressStatus(progress({ records: { active: 12 } }))).toBe('processed');
  });

  it('picks the bar value, indeterminate whenever the connector is still reading', () => {
    expect(sourceProgressValue(progress())).toBe(0);
    expect(sourceProgressValue(progress({ reading: { state: 'reading' } }))).toBeNull();
    expect(sourceProgressValue(progress({ reading: { state: 'reading' }, processing: { total: 4, succeeded: 4, percent: 100 } }))).toBeNull();
    expect(sourceProgressValue(progress({ reading: { state: 'completed' }, processing: { total: 4, queued: 3, succeeded: 1, percent: 25 } }))).toBe(25);
    expect(sourceProgressValue(progress({ reading: { state: 'completed' }, records: { active: 4 }, indexing: { state: 'ok', expected: 4, indexed: 3, indexing: 1, percent: 75 } }))).toBe(75);
    expect(sourceProgressValue(progress({ reading: { state: 'completed' } }))).toBe(100);
  });

  it('floors percentages so in-flight work never reads 100%', () => {
    expect(formatProgressPercent(99.9)).toBe('99%');
    expect(formatProgressPercent(33.3)).toBe('33%');
    expect(formatProgressPercent(140)).toBe('100%');
  });

  it('describes counts, failures and stored records', () => {
    expect(sourceProgressDetail(progress())).toMatch(/No sync has started yet/);
    expect(sourceProgressDetail(progress({ reading: { state: 'reading' } }))).toBe('Nothing delivered yet · 0 records stored');
    expect(sourceProgressDetail(progress({ reading: { state: 'reading' }, processing: { total: 12, succeeded: 12, percent: 100 }, records: { active: 12 } }))).toBe('12 of 12 items processed so far · 12 records stored');
    expect(sourceProgressDetail(progress({ reading: { state: 'completed' }, processing: { total: 1200, queued: 658, succeeded: 540, failed: 2, percent: 45.2 }, records: { active: 538, quarantined: 1 } }))).toBe(
      '542 of 1,200 items processed · 2 failed · 1 quarantined · 538 records stored',
    );
    expect(sourceProgressDetail(progress({ reading: { state: 'completed' }, processing: { total: 1, succeeded: 1, percent: 100 }, records: { active: 1 } }))).toBe('1 of 1 item processed · 1 record stored');
  });

  it('reports sync timing and indexing only when the engine has something to say', () => {
    const recent = new Date(Date.now() - 3 * 60_000).toISOString();
    expect(sourceSyncText(progress())).toBeNull();
    expect(sourceSyncText(progress({ reading: { state: 'reading', startedAt: recent } }))).toBe('Still reading · sync started 3 min ago');
    expect(sourceSyncText(progress({ reading: { state: 'completed', completedAt: recent } }))).toBe('Last sync finished 3 min ago');
    expect(sourceIndexingText(progress())).toBeNull();
    expect(sourceIndexingText(progress({ indexing: { state: 'unavailable' } }))).toMatch(/unavailable/);
    expect(sourceIndexingText(progress({ indexing: { state: 'ok', expected: 8, indexed: 6, indexing: 1, missing: 1, percent: 75 } }))).toBe('75% indexed (6 of 8) · 1 missing');
  });

  it('rolls progress up across sources, counting ones the caller cannot inspect as hidden', () => {
    const list = [
      progress({ sourceId: 'a', reading: { state: 'completed' }, processing: { total: 10, succeeded: 9, failed: 1, percent: 100 }, records: { active: 9 } }),
      progress({ sourceId: 'b', reading: { state: 'reading' }, processing: { total: 10, queued: 8, succeeded: 2, percent: 20 } }),
      progress({ sourceId: 'c' }),
    ];
    const sum = summarizeEngineProgress(['a', 'b', 'c', 'd'], list);
    expect(sum).toEqual({ sourceCount: 4, processed: 1, active: 1, reading: 1, waiting: 1, hidden: 1, percent: 60, failedItems: 1 });
    expect(progressHeadline(sum)).toBe('1 of 3 sources processed');
    expect(progressListingText(sum)).toBe('Syncing');
    expect(progressListingText({ ...sum, reading: 0 })).toBe('Syncing · 60%');
    expect(isEngineProgressActive({ available: true, sources: list })).toBe(true);
    expect(isEngineProgressActive({ available: false, sources: list })).toBe(false);
  });

  it('follows the earliest moving stage for the whole-engine bar', () => {
    const done = progress({ sourceId: 'a', reading: { state: 'completed' }, processing: { total: 10, succeeded: 10, percent: 100 }, records: { active: 10 } });
    const queued = progress({ sourceId: 'b', reading: { state: 'completed' }, processing: { total: 10, queued: 5, succeeded: 5, percent: 50 } });
    const reading = progress({ sourceId: 'c', reading: { state: 'reading' }, processing: { total: 10, succeeded: 10, percent: 100 } });
    const indexing = progress({ sourceId: 'd', reading: { state: 'completed' }, processing: { total: 10, succeeded: 10, percent: 100 }, records: { active: 10 }, indexing: { state: 'ok', expected: 10, indexed: 4, indexing: 6, percent: 40 } });
    expect(overallProgress([done])).toBeNull();
    expect(overallProgress([done, reading])).toEqual({ value: null, text: '100% of delivered items processed so far' });
    expect(overallProgress([queued, indexing])).toEqual({ value: 75, text: '75% of delivered items processed' });
    expect(overallProgress([done, indexing])).toEqual({ value: 40, text: '40% of stored records indexed' });
    expect(overallProgress([progress({ reading: { state: 'reading' } })])).toEqual({ value: null, text: 'Waiting for the first items' });
  });

  it('keeps the listing quiet when there is nothing to report', () => {
    expect(progressListingText(null)).toBeNull();
    expect(progressListingText(summarizeEngineProgress([], []))).toBeNull();
    expect(progressListingText(summarizeEngineProgress(['a'], []))).toBeNull();
    expect(progressListingText(summarizeEngineProgress(['a'], [progress({ sourceId: 'a' })]))).toBe('Waiting for data');
    expect(progressListingText(summarizeEngineProgress(['a', 'b'], [progress({ sourceId: 'a', records: { active: 3 } }), progress({ sourceId: 'b' })]))).toBe('1 of 2 processed');
    expect(progressHeadline(summarizeEngineProgress(['a'], []))).toBe('Progress hidden');
  });
});
