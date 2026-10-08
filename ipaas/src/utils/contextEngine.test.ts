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
  audienceError,
  audienceMappingFromRules,
  sourceAsConfig,
  checkStagedFile,
  contentTypeForFile,
  deliveryIdentity,
  engineMessage,
  formatBytes,
  describeUploadAudience,
  citationLinks,
  endsSentence,
  splitSentences,
  askedQuestionMeta,
  citedNumbers,
  deletionFailureText,
  evidencePlace,
  evidenceVersionLabel,
  isSameModel,
  modelDraftError,
  modelKeysLabel,
  passageLines,
  toModelInput,
  describeVisibility,
  everyoneRoles,
  sharingMismatches,
  stagedBlocker,
  stagedFileNote,
  stagedSummary,
  summarizeUploads,
  uploadSourceRules,
  uploadStatusFromRecord,
  visibilityError,
  visibilityTags,
  visibilityWarnings,
  withSourceVisibilityRules,
  buildMcpClientConfig,
  evidenceLocationLabel,
  ownerGrantId,
  resolveGraphStatus,
  summarizeAudience,
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
  isFieldVisible,
  isFormComplete,
  isHttpUrl,
  isLlmValid,
  isNameStepValid,
  isSourceValid,
  visibleFields,
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
import { blankLlm, blankSource, CONTEXT_ENGINE_NAME_MAX, defaultStorage, isConnectorEnabled, SOURCE_CONNECTORS } from '../constants/contextEngine';
import type { ContextEngineDetail, ContextEngineForm, ContextGrant, ContextRecordStatus, ContextSourceConfig, SourceProgress } from '../types/contextEngine';
import { HttpError } from '../types/http';
import { dropStagedFile, putStagedFile } from './stagedFiles';
import type { EmbeddingConfig } from '../types/ragIngestion';

const embedding: EmbeddingConfig = { provider: 'openai', model: 'text-embedding-3-small', apiKey: 'sk-test', azureApiVersion: '', azureBaseUrl: '' };

const RULE = { group: 'engineering', role: 'admin' };

/** A source with field values and one complete visibility rule. */
const withValues = (id: string, values: Record<string, string>, name?: string): ContextSourceConfig => {
  const blank = blankSource(id);
  return { ...blank, name: name ?? blank.name, values: { ...blank.values, ...values }, audience: [RULE] };
};

/** The upload connector has no fields, so this is complete once it has a rule. */
const upload = (name?: string): ContextSourceConfig => withValues('upload', {}, name);

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
    expect(isSourceValid(withValues('gdrive', { folderId: 'abc', clientId: 'c', clientSecret: 's', refreshToken: 'r' }))).toBe(true);
    expect(isSourceValid(withValues('website', { urls: 'https://a.com\nnot-a-url' }))).toBe(false);
    expect(isSourceValid(withValues('website', { urls: 'https://a.com' }))).toBe(true);
    expect(isSourceValid(upload())).toBe(true);
    expect(isSourceValid(blankSource('upload'))).toBe(true); // uploads choose who can see them per upload; no rules to type
    expect(isSourceValid({ type: 'gone', name: 'x', values: {}, audience: [RULE] })).toBe(false);
  });

  it('reports the first missing or invalid field and lists them in schema order', () => {
    const src = withValues('confluence', { baseUrl: 'bad-url', spaceKey: 'SUP' });
    expect(invalidSourceFields(src).map((f) => f.key)).toEqual(['baseUrl', 'email', 'apiToken']);
    expect(sourceIncompleteReason(src)).toBe('Base URL invalid');
    expect(sourceIncompleteReason(withValues('confluence', { baseUrl: 'https://x.atlassian.net/wiki' }))).toBe('Space Key missing');
    expect(sourceIncompleteReason(upload())).toBe('');
    expect(sourceIncompleteReason(blankSource('upload'))).toBe('');
    // Every source defaults to "everyone who can query"; only an empty "only some roles" choice is incomplete.
    const drive = withValues('gdrive', { folderId: 'abc', clientId: 'c', clientSecret: 's', refreshToken: 'r' });
    expect(sourceIncompleteReason(drive)).toBe('');
    expect(sourceIncompleteReason({ ...drive, stagedVisibility: { kind: 'roles', roles: [] } })).toBe('Choose who can see this content');
  });

  it('rejects empty and duplicate names', () => {
    expect(sourceNameError('  ', [])).not.toBe('');
    expect(sourceNameError('Docs', ['docs'])).not.toBe('');
    expect(sourceNameError('Docs', ['Other'])).toBe('');
    expect(isSourceValid({ ...upload(), name: '  ' })).toBe(false);
  });

  it('explains why the step is blocked, in priority order', () => {
    expect(sourcesStepBlocker([])).toBe('Add at least one source to continue');
    const a = upload();
    expect(sourcesStepBlocker([a])).toBeNull();
    expect(sourcesStepBlocker([a, upload()])).toBe('Give each source a unique name');
    expect(sourcesStepBlocker([a, withValues('github', {}, 'Platform docs')])).toBe('Complete “Platform docs” to continue');
    expect(sourcesStepBlocker([a, { ...withValues('gdrive', { folderId: 'abc', apiKey: 'k' }, 'Second'), stagedVisibility: { kind: 'roles', roles: [] } }])).toBe('Complete “Second” to continue');
    expect(isSourcesStepValid([a, upload('Second')])).toBe(true);
  });

  it('shows and requires only the fields of the chosen Salesforce auth flow', () => {
    const sf = SOURCE_CONNECTORS.find((c) => c.id === 'salesforce')!;
    const refreshToken = sf.fields.find((f) => f.key === 'refreshToken')!;
    const token = sf.fields.find((f) => f.key === 'token')!;
    const clientId = sf.fields.find((f) => f.key === 'clientId')!;

    // Default flow is client credentials: the Connected App fields show, the flow-specific secrets do not.
    expect(blankSource('salesforce').values.authType).toBe('client_credentials');
    expect(isFieldVisible(clientId, { authType: 'client_credentials' })).toBe(true);
    expect(isFieldVisible(refreshToken, { authType: 'client_credentials' })).toBe(false);
    expect(isFieldVisible(refreshToken, { authType: 'refresh_token' })).toBe(true);
    expect(isFieldVisible(token, { authType: 'bearer' })).toBe(true);
    expect(isFieldVisible(clientId, { authType: 'bearer' })).toBe(false);

    const base = { baseUrl: 'https://acme.my.salesforce.com', sobject: 'Account', fields: 'Name' };
    // Client credentials is complete with the app key and secret; its hidden refresh token is not demanded.
    expect(isSourceValid(withValues('salesforce', { ...base, clientId: 'c', clientSecret: 's' }))).toBe(true);
    // Refresh-token flow additionally requires the refresh token.
    expect(isSourceValid(withValues('salesforce', { ...base, authType: 'refresh_token', clientId: 'c', clientSecret: 's' }))).toBe(false);
    expect(isSourceValid(withValues('salesforce', { ...base, authType: 'refresh_token', clientId: 'c', clientSecret: 's', refreshToken: 'r' }))).toBe(true);
    // Bearer flow needs only the access token.
    expect(invalidSourceFields(withValues('salesforce', { ...base, authType: 'bearer' })).map((f) => f.key)).toEqual(['token']);
    expect(isSourceValid(withValues('salesforce', { ...base, authType: 'bearer', token: 't' }))).toBe(true);

    expect(visibleFields(sf, { authType: 'bearer' }).map((f) => f.key)).not.toContain('refreshToken');
  });

  it('shows and requires only the fields of the chosen Google Drive auth flow', () => {
    const gd = SOURCE_CONNECTORS.find((c) => c.id === 'gdrive')!;
    const clientEmail = gd.fields.find((f) => f.key === 'clientEmail')!;
    const refreshToken = gd.fields.find((f) => f.key === 'refreshToken')!;

    // Default flow is refresh token: its credentials show, the service-account fields do not.
    expect(blankSource('gdrive').values.authType).toBe('refresh_token');
    expect(isFieldVisible(refreshToken, { authType: 'refresh_token' })).toBe(true);
    expect(isFieldVisible(clientEmail, { authType: 'refresh_token' })).toBe(false);
    expect(isFieldVisible(clientEmail, { authType: 'service_account' })).toBe(true);

    // Refresh-token flow needs the client id, secret and refresh token besides the folder.
    expect(isSourceValid(withValues('gdrive', { folderId: 'f', clientId: 'c', clientSecret: 's' }))).toBe(false);
    expect(isSourceValid(withValues('gdrive', { folderId: 'f', clientId: 'c', clientSecret: 's', refreshToken: 'r' }))).toBe(true);
    // Bearer flow needs only the access token; service account needs the email and key path (subject is optional).
    expect(isSourceValid(withValues('gdrive', { folderId: 'f', authType: 'bearer', token: 't' }))).toBe(true);
    expect(invalidSourceFields(withValues('gdrive', { folderId: 'f', authType: 'service_account' })).map((f) => f.key)).toEqual(['clientEmail', 'privateKeyPath']);
  });

  it('offers an optional RML mapping on structured connectors', () => {
    const connector = (id: string) => SOURCE_CONNECTORS.find((c) => c.id === id)!;
    const rmlOf = (id: string) => visibleFields(connector(id), { authType: 'client_credentials' }).find((f) => f.key === 'rmlMapping');
    // The mapping is driven by the connector's isStructuredData flag, not declared in its fields.
    expect(connector('salesforce').isStructuredData).toBe(true);
    expect(connector('gdrive').isStructuredData).toBeUndefined();
    expect(rmlOf('salesforce')).toMatchObject({ kind: 'file', required: false, group: 'RML Mapping' });
    expect(rmlOf('gdrive')).toBeUndefined();
    expect(rmlOf('upload')).toBeUndefined();

    // Optional: a source is valid without it, and its contents travel as a setting when provided.
    const base = { baseUrl: 'https://acme.my.salesforce.com', sobject: 'Account', fields: 'Name', clientId: 'c', clientSecret: 's' };
    expect(isSourceValid(withValues('salesforce', base))).toBe(true);
    const mapped = withValues('salesforce', { ...base, rmlMapping: '@prefix ex: <http://ex> .' });
    const settings = toConfigurationPayload(toCreateInput({ ...completeForm(), sources: [mapped] })).sources[0].settings;
    expect(settings.rmlMapping).toBe('@prefix ex: <http://ex> .');
  });

  it('models and enables the supported SQL databases', () => {
    const keys = (id: string) => SOURCE_CONNECTORS.find((c) => c.id === id)!.fields.map((f) => f.key);
    // Only MySQL, PostgreSQL and SQL Server are supported, and they are enabled.
    for (const id of ['mysql', 'postgresql', 'mssql']) expect(isConnectorEnabled(id)).toBe(true);
    // Core DatabaseSettings fields are present on each.
    for (const id of ['mysql', 'postgresql', 'mssql']) {
      expect(keys(id)).toEqual(expect.arrayContaining(['host', 'port', 'database', 'username', 'password', 'tableName', 'primaryKey', 'columns', 'updatedAtColumn', 'cdcEnabled']));
    }
    // MySQL has no schema layer; PostgreSQL and SQL Server do.
    expect(keys('mysql')).not.toContain('schema');
    expect(keys('postgresql')).toContain('schema');
    expect(keys('mssql')).toContain('schema');
    // PostgreSQL exposes its CDC replication overrides.
    expect(keys('postgresql')).toEqual(expect.arrayContaining(['slotName', 'publicationName']));
    // Per-dialect default ports and CDC on by default.
    expect(blankSource('mysql').values.port).toBe('3306');
    expect(blankSource('mssql').values.port).toBe('1433');
    expect(blankSource('postgresql').values.cdcEnabled).toBe('true');
  });

  it('needs at least one complete, unique visibility rule', () => {
    expect(audienceError([])).toMatch(/nobody will see/);
    expect(audienceError([{ group: '', role: '' }])).toMatch(/nobody will see/);
    expect(audienceError([RULE, { group: '', role: '' }])).toBe(''); // blank placeholder rows are ignored
    expect(audienceError([{ group: 'engineering', role: '' }])).toMatch(/half-filled/);
    expect(audienceError([RULE, { group: ' engineering ', role: 'developer' }])).toMatch(/one role only/);
    expect(audienceError([RULE, { group: 'support', role: 'developer' }])).toBe('');
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
  it('turns rules into the engine mapping and a source back into a config', () => {
    expect(
      audienceMappingFromRules([
        { group: ' a ', role: ' admin ' },
        { group: 'b', role: '' },
        { group: '', role: 'x' },
        { group: 'a', role: 'developer' },
      ]),
    ).toEqual({ a: 'developer' });
    expect(audienceMappingFromRules(undefined)).toEqual({});
    const src = { id: 's1', name: 'Wiki', type: 'confluence', state: 'ready' };
    expect(sourceAsConfig(src)).toEqual({ type: 'confluence', name: 'Wiki', values: {}, audience: [], stagedVisibility: { kind: 'everyone' } });
    expect(sourceAsConfig(src, [{ group: 'eng', role: 'admin' }]).audience).toEqual([{ group: 'eng', role: 'admin' }]);
  });

  it('registers a source without credentials', () => {
    const src = completeForm().sources[0];
    expect(toSourceRegistration(src)).toEqual({ name: 'GitHub', type: 'github', audienceMapping: { engineering: 'admin' } });
    const trimmed = {
      ...src,
      audience: [
        { group: ' support ', role: 'developer' },
        { group: '', role: '' },
      ],
    };
    expect(toSourceRegistration(trimmed).audienceMapping).toEqual({ support: 'developer' });
  });

  it('separates settings from credentials and adds azure fields only for azure', () => {
    const payload = toConfigurationPayload(toCreateInput(completeForm()));
    expect(payload.sources[0].settings).toEqual({ repositoryUrl: 'https://github.com/wso2/docs', branch: 'main', includePaths: '' });
    expect(payload.sources[0].credentials).toEqual({ accessToken: 'ghp_x' });
    expect(payload.llm).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'sk-ant' });
    expect(payload.embedding.baseUrl).toBeUndefined();
  });

  it('sends only the settings and credentials the chosen auth flow uses', () => {
    const sf = withValues('salesforce', { baseUrl: 'https://acme.my.salesforce.com', sobject: 'Account', fields: 'Name, Industry', clientId: 'c', clientSecret: 's', refreshToken: 'stale' });
    const form = { ...completeForm(), sources: [sf] };
    const source = toConfigurationPayload(toCreateInput(form)).sources[0];
    // Client credentials is the default flow: the Connected App key is a setting, the hidden refresh token is dropped.
    expect(source.settings).toMatchObject({ authType: 'client_credentials', baseUrl: 'https://acme.my.salesforce.com', sobject: 'Account', fields: 'Name, Industry', clientId: 'c', apiVersion: '59.0' });
    expect(source.credentials).toEqual({ clientSecret: 's' });
    expect(source.credentials.refreshToken).toBeUndefined();
  });

  it('summarizes sources for review', () => {
    expect(summarizeSource(withValues('amazons3', { bucketName: 'docs', prefix: 'kb/' }))).toBe('docs · kb/');
    expect(summarizeSource(withValues('website', { urls: 'https://a.com\nhttps://b.com' }))).toBe('2 URLs');
    expect(summarizeSource(blankSource('gdrive'))).toBe('Not configured yet');
    expect(summarizeSource(blankSource('upload'))).toBe('Upload files after the engine is created');
    expect(summarizeAudience([RULE, { group: 'support', role: 'developer' }], { admin: 'Admin' })).toBe('engineering → Admin · support → developer');
    expect(summarizeAudience([{ group: '', role: '' }])).toBe('Not visible to anyone yet');
  });
});

describe('exposure snippets', () => {
  it('builds a curl against the queries route', () => {
    const curl = buildQueryCurl('https://engine.example.com', 'space-1');
    expect(curl).toContain('https://engine.example.com/v1/queries');
    expect(curl).toContain('"spaceId": "space-1"');
    expect(curl).toContain('"mode": "context"');
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
    // Malformed models in an old draft are dropped or coerced, never handed to the wizard's checks.
    const malformed = { v: 1, savedAt: 'x', form: { sources: [], roles: [], name: 'E', embedding: 'openai', llm: { provider: 'openai' }, storage: {} } };
    const bad = fromDraft(JSON.stringify(malformed))!.form;
    expect(bad.embedding).toBeNull();
    expect(bad.llm).toEqual({ provider: 'openai', model: '', apiKey: '', azureBaseUrl: '', azureApiVersion: '' });
    expect(fromDraft(JSON.stringify({ ...malformed, form: { ...malformed.form, llm: { provider: 'nope', model: 'x' } } }))!.form.llm).toBeNull();
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
    expect(graphStatusText({ state: 'not_built' })).toBe('Not enriched');
    expect(graphStatusText({ state: 'building', progress: { done: 2, total: 3 } })).toBe('Enriching · 2 of 3 sources');
    expect(graphStatusText({ state: 'built', builtAt: new Date(Date.now() - 5 * 60_000).toISOString() })).toBe('Enriched 5 min ago');
    expect(graphStatusText({ state: 'failed' })).toBe('Enrichment failed');
    expect(graphStatusTone({ state: 'built' })).toBe('success');
    expect(graphStatusTone({ state: 'not_built' })).toBe('default');
  });

  it('fills in enrichment status from a job this browser started when the engine reports none', () => {
    const job = (state: string) => ({ id: 'job_1', state, operation: 'enrichment', traceId: 't', attemptCount: 1, createdAt: '2026-09-25T10:00:00Z' });
    const none = { state: 'not_built' as const };
    expect(resolveGraphStatus(none, undefined)).toEqual(none);
    expect(resolveGraphStatus(none, undefined, true)).toEqual({ state: 'building' });
    expect(resolveGraphStatus(none, job('queued'))).toEqual({ state: 'building', jobId: 'job_1' });
    expect(resolveGraphStatus(none, job('succeeded'))).toEqual({ state: 'built', builtAt: '2026-09-25T10:00:00Z', jobId: 'job_1' });
    expect(resolveGraphStatus(none, job('failed'))).toEqual({ state: 'failed', jobId: 'job_1' });
    const reported = { state: 'built' as const, builtAt: '2026-09-25T12:00:00Z' };
    expect(resolveGraphStatus(reported, job('failed'))).toEqual(reported); // the engine's own report wins once it has one
    expect(resolveGraphStatus(reported, job('running'))).toEqual({ state: 'building', jobId: 'job_1' });
  });

  it('marks the first unfinished step current and the rest todo', () => {
    const steps = getStartedSteps(engineDetail(), false);
    expect(steps.map((s) => s.id)).toEqual(['index', 'ask', 'publish', 'grant']);
    expect(steps.map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(steps[0].description).toBe('Items become searchable as the connector delivers them from 2 sources.');
    const later = getStartedSteps(engineDetail({ graph: { state: 'built' }, queryRoles: ['admin'] }), true);
    expect(later.map((s) => s.state)).toEqual(['done', 'done', 'current', 'done']);
    expect(later[3].description).toBe('1 role can query.');
  });

  it('completes the index step from source progress once nothing is still moving', () => {
    const summary = { sourceCount: 2, processed: 1, active: 1, reading: 0, waiting: 0, hidden: 0, percent: 50, failedItems: 0 };
    const moving = getStartedSteps(engineDetail(), false, summary);
    expect(moving[0].state).toBe('current');
    expect(moving[0].description).toBe('1 of 2 sources processed. Items become searchable as the connector delivers them from 2 sources.');
    expect(getStartedSteps(engineDetail(), false, { ...summary, active: 0, waiting: 1 })[0].state).toBe('done');
    expect(getStartedSteps(engineDetail(), false, { ...summary, processed: 0, active: 0, waiting: 2 })[0].state).toBe('current');
  });
});

describe('owner grant and evidence labels', () => {
  it('keys the creator grant by principal within the grant-id charset', () => {
    expect(ownerGrantId('prn_5489f0de')).toBe('owner-prn_5489f0de');
    expect(ownerGrantId('user@example.com')).toBe('owner-user-example.com');
  });

  it('turns chunk locations into human parts', () => {
    expect(evidenceLocationLabel('chunk:0')).toBe('Part 1');
    expect(evidenceLocationLabel('page 4')).toBe('page 4');
    expect(evidenceLocationLabel(undefined)).toBe('');
  });

  it('restores a draft saved before visibility existed with no rules and everyone visibility', () => {
    const old = JSON.stringify({ v: 1, savedAt: 'x', form: { sources: [{ type: 'upload', name: 'Files', values: {} }], roles: [], name: 'n', description: '' } });
    const restored = fromDraft(old)?.form.sources[0];
    expect(restored?.audience).toEqual([]);
    expect(restored?.stagedVisibility).toEqual({ kind: 'everyone' });
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

describe('file uploads', () => {
  const MB = 1024 * 1024;
  const record = (o: Partial<ContextRecordStatus>): ContextRecordStatus => ({ recordId: 'r', state: 'active', currentVersion: '1', sourceAclVersion: '1', indexState: 'pending', updatedAt: 'x', ...o });

  it('decides the content type by extension before the browser type', () => {
    expect(contentTypeForFile('notes.md', '')).toBe('text/markdown');
    expect(contentTypeForFile('README.MD', 'application/octet-stream')).toBe('text/markdown');
    expect(contentTypeForFile('data.json')).toBe('application/json');
    expect(contentTypeForFile('archive', 'text/plain; charset=utf-8')).toBe('text/plain');
    expect(contentTypeForFile('photo.png', 'image/png')).toBe('');
  });

  it('formats sizes without a stray decimal', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(3277)).toBe('3.2 KB');
    expect(formatBytes(25 * MB)).toBe('25 MB');
    expect(formatBytes(4.8 * MB)).toBe('4.8 MB');
  });

  it('checks a chosen file and explains the outcome', () => {
    const big = { name: 'metrics.json', size: 41.2 * MB, contentType: 'application/json' };
    const bin = { name: 'app.bin', size: 10, contentType: '' };
    const pdf = { name: 'ref.pdf', size: 4.8 * MB, contentType: 'application/pdf' };
    const dup = { name: 'oncall.txt', size: 1100, contentType: 'text/plain' };
    expect(checkStagedFile(big, [])).toEqual({ problem: 'too-large', replaces: false });
    expect(stagedFileNote(checkStagedFile(big, []), big.size)).toBe('41.2 MB is over the 25 MB limit. Split it or leave it out.');
    expect(checkStagedFile(bin, [])).toEqual({ problem: 'unsupported', replaces: false });
    expect(checkStagedFile(pdf, [])).toEqual({ warning: 'pdf', replaces: false });
    expect(checkStagedFile(dup, ['oncall.txt'])).toEqual({ replaces: true });
    expect(stagedFileNote(checkStagedFile(dup, ['oncall.txt']), dup.size)).toBe('Replaces the version already in the source');
    expect(stagedSummary([big, bin, pdf, dup], ['oncall.txt'])).toEqual({ ready: 2, skipped: 2, bytes: pdf.size + dup.size, pdfs: 1 });
  });

  it('turns a file visibility choice into role tags and identity rules', () => {
    const everyone = everyoneRoles(['admin', 'developer', 'viewer'], ['developer', 'project-admin']);
    expect(everyone).toEqual(['admin', 'developer', 'viewer', 'project-admin']);
    // Without org roles, the granted roles and the uploader's own groups stand in.
    expect(everyoneRoles(undefined, ['developer'], ['admin', 'operators'])).toEqual(['developer', 'admin', 'operators']);
    expect(visibilityTags({ kind: 'everyone' }, everyone)).toEqual(everyone);
    expect(visibilityTags(undefined, everyone)).toEqual(everyone);
    expect(visibilityTags({ kind: 'roles', roles: [' viewer ', 'viewer', 'admin'] }, everyone)).toEqual(['viewer', 'admin']);
    expect(uploadSourceRules(['admin', 'viewer', 'admin'])).toEqual([
      { group: 'admin', role: 'admin' },
      { group: 'viewer', role: 'viewer' },
    ]);
    // An upload allows every granted role; a connector's audience comes from its own visibility.
    const sources = withSourceVisibilityRules(
      [upload('Files'), withValues('gdrive', { folderId: 'abc', apiKey: 'k' }), { ...withValues('gdrive', { folderId: 'x', apiKey: 'y' }), stagedVisibility: { kind: 'roles', roles: ['viewer'] } }],
      ['admin'],
    );
    expect(sources[0].audience).toEqual([{ group: 'admin', role: 'admin' }]);
    expect(sources[1].audience).toEqual([{ group: 'admin', role: 'admin' }]);
    expect(sources[2].audience).toEqual([{ group: 'viewer', role: 'viewer' }]);
    expect(visibilityError({ kind: 'roles', roles: [] })).toBe('Choose at least one role');
    expect(visibilityError({ kind: 'everyone' })).toBe('');
  });

  it('describes who can see uploaded files', () => {
    const names = { admin: 'Admin', viewer: 'Viewer' };
    expect(describeVisibility(undefined)).toBe('Everyone who can query');
    expect(describeVisibility({ kind: 'roles', roles: ['admin', 'viewer'] }, names)).toBe('Admin, Viewer');
    expect(describeUploadAudience({ label: 'eng' })).toBe('Label “eng”');
    expect(describeUploadAudience({ visibility: { kind: 'roles', roles: ['viewer'] } }, names)).toBe('Viewer');
  });

  it('warns when shared roles cannot query or the uploader is left out', () => {
    const everyone = ['admin', 'developer', 'viewer'];
    const names = { viewer: 'Viewer', developer: 'Developer' };
    expect(visibilityWarnings({ visibility: { kind: 'everyone' }, everyone, queryRoles: ['admin'], myGroups: ['admin', 'operators'] })).toEqual([]);
    expect(visibilityWarnings({ visibility: { kind: 'roles', roles: ['viewer'] }, everyone, queryRoles: ['admin'], myGroups: ['admin', 'operators'], roleNames: names })).toEqual([
      "Viewer can't query this engine, so it won't find these files until granted access.",
      "You aren't in any of these roles, so these files won't show in your own answers.",
    ]);
    expect(visibilityWarnings({ visibility: { kind: 'roles', roles: ['viewer', 'developer'] }, everyone, queryRoles: ['admin'], roleNames: names })[0]).toBe("Viewer and Developer can't query this engine, so they won't find these files until granted access.");
    // In the wizard's first step query access is not chosen yet, so only the uploader check applies.
    expect(visibilityWarnings({ visibility: { kind: 'roles', roles: ['admin'] }, everyone, myGroups: ['admin'] })).toEqual([]);
  });

  it('finds where query access and visibility disagree across an engine', () => {
    const everyone = ['admin', 'developer', 'viewer'];
    const drive = { ...withValues('gdrive', { folderId: 'abc', apiKey: 'k' }, 'Drive'), stagedVisibility: { kind: 'roles' as const, roles: ['viewer'] } };
    const files = { ...upload('Files'), stagedVisibility: { kind: 'everyone' as const } };
    // Files shared with everyone cover every role; the drive is shared only with viewer.
    expect(sharingMismatches([drive, files], ['developer'], everyone, ['admin'])).toEqual({ seeNothing: [], cannotQuery: ['viewer'], hiddenFromMe: ['Drive'] });
    // With only the connector, Developer can query but sees nothing.
    expect(sharingMismatches([drive], ['developer', 'viewer'], everyone, ['viewer'])).toEqual({ seeNothing: ['developer'], cannotQuery: [], hiddenFromMe: [] });
  });

  it('maps record status to a file status', () => {
    expect(uploadStatusFromRecord(record({ indexState: 'indexed' }))).toEqual({ status: 'searchable' });
    expect(uploadStatusFromRecord(record({ indexState: 'pending' }))).toEqual({ status: 'indexing' });
    expect(uploadStatusFromRecord(record({ indexState: 'failed', indexError: 'extraction_unsupported' })).status).toBe('unreadable');
    expect(uploadStatusFromRecord(record({ indexState: 'failed', indexError: 'backend_error' }))).toEqual({ status: 'failed', detail: 'Indexing failed: backend_error.' });
    expect(uploadStatusFromRecord(record({ indexState: 'not_indexed' })).status).toBe('stored');
    expect(uploadStatusFromRecord(record({ state: 'quarantined', quarantineReason: 'unmapped_audience' }))).toEqual({
      status: 'held',
      detail: "The source has no rule for this file's roles yet, so nobody can see it. Someone who manages the source can fix it by changing who can see the file.",
    });
    expect(summarizeUploads([{ status: 'searchable' }, { status: 'searchable' }, { status: 'held' }, { status: 'uploading' }])).toBe('4 files · 1 in progress · 2 searchable · 1 held back');
    expect(summarizeUploads([])).toBe('No files yet');
  });

  it('reads the engine message out of an HTTP error', () => {
    expect(engineMessage(new HttpError(415, 'HTTP 415: {"code":"unsupported_media_type","message":"Unsupported Media Type","traceId":"t"}'))).toBe('Unsupported Media Type');
    expect(engineMessage(new HttpError(502, 'HTTP 502: Bad Gateway'))).toBe('Bad Gateway');
    expect(engineMessage(new Error('offline'))).toBe('offline');
    expect(deliveryIdentity('a.md', '17')).toBe('4:a.md:17');
  });

  it('blocks a File Upload source whose staged files lack a role choice or their bytes', () => {
    const src: ContextSourceConfig = { ...upload('Files'), staged: [{ id: 'f1', name: 'a.md', size: 10, contentType: 'text/markdown' }], stagedVisibility: { kind: 'roles', roles: [] } };
    expect(stagedBlocker(src)).toBe('Choose who can see the files');
    expect(isSourceValid(src)).toBe(false);
    const labelled: ContextSourceConfig = { ...src, stagedVisibility: { kind: 'everyone' } };
    expect(stagedBlocker(labelled)).toBe('Re-add 1 file');
    expect(sourceIncompleteReason(labelled)).toBe('Re-add 1 file');
    putStagedFile('f1', new Blob(['# a']));
    expect(stagedBlocker(labelled)).toBe('');
    expect(isSourceValid(labelled)).toBe(true);
    expect(summarizeSource(labelled)).toBe('1 file staged · 10 B');
    dropStagedFile('f1');
    expect(summarizeSource(upload())).toBe('Upload files after the engine is created');
  });

  it('keeps staged file names and their role choice in a restored draft', () => {
    const staged = [{ id: 'f1', name: 'a.md', size: 10, contentType: 'text/markdown' }];
    const form = { ...completeForm(), sources: [{ ...upload('Files'), staged, stagedVisibility: { kind: 'roles' as const, roles: ['viewer'] } }] };
    const restored = fromDraft(JSON.stringify(toDraft(form, 'x')))!.form.sources[0];
    expect(restored.staged).toEqual(staged);
    expect(restored.stagedVisibility).toEqual({ kind: 'roles', roles: ['viewer'] });
    // A draft saved with the old label falls back to everyone who can query.
    const old = JSON.stringify({ v: 1, savedAt: 'x', form: { ...form, sources: [{ ...upload('Files'), staged, stagedLabel: 'eng' }] } });
    expect(fromDraft(old)!.form.sources[0].stagedVisibility).toEqual({ kind: 'everyone' });
  });

  it('offers the upload step first on an engine that only has an upload source', () => {
    const steps = getStartedSteps(engineDetail(), false, null, true);
    expect(steps[0]).toMatchObject({ id: 'index', title: 'Upload your first files', action: 'Upload files', state: 'current' });
    expect(getStartedSteps(engineDetail({ graph: { state: 'built' } }), false, null, true)[0].title).toBe('Index your sources');
  });
});

describe('provenance and evidence', () => {
  const ev = (locator: object, passage = 'a\nb\nc') => ({ id: 'e', recordId: 'r.md', sourceId: 's', sourceVersion: '1', passage, location: 'chunk:2', locator });

  it('names where a passage sits, as precisely as the engine placed it', () => {
    expect(evidencePlace(ev({ chunkIndex: 0, lines: { first: 4, last: 7 }, sentences: { first: 2, last: 3 }, heading: 'Rollback steps' }))).toEqual({ path: undefined, parts: ['Lines 4–7', 'under “Rollback steps”'], coarse: false });
    expect(evidencePlace(ev({ chunkIndex: 0, lines: { first: 9, last: 9 } })).parts).toEqual(['Line 9']);
    expect(evidencePlace(ev({ chunkIndex: 1, path: '$.rollback.freezeWindow', sentences: { first: 1, last: 1 } }))).toEqual({ path: '$.rollback.freezeWindow', parts: [], coarse: false });
    expect(evidencePlace(ev({ chunkIndex: 3, sentences: { first: 3, last: 4 }, heading: 'Incidents' })).parts).toEqual(['Sentences 3–4', 'under “Incidents”']);
    // A PDF or office file is placed by its part only.
    expect(evidencePlace(ev({ chunkIndex: 2 }))).toEqual({ path: undefined, parts: ['Part 3'], coarse: true });
    expect(evidencePlace({ location: 'chunk:4', locator: undefined })).toEqual({ path: undefined, parts: ['Part 5'], coarse: true });
  });

  it('shows epoch versions as dates and leaves other versions alone', () => {
    expect(evidenceVersionLabel('1790872243455')).toMatch(/2026/);
    expect(evidenceVersionLabel('v12')).toBe('v12');
    expect(evidenceVersionLabel('17')).toBe('17');
  });

  it('numbers passage lines only when they line up with the locator', () => {
    expect(passageLines(ev({ lines: { first: 4, last: 6 } }))).toEqual([
      { n: 4, text: 'a' },
      { n: 5, text: 'b' },
      { n: 6, text: 'c' },
    ]);
    expect(passageLines(ev({ lines: { first: 1, last: 11 } }))).toBeNull();
    expect(passageLines(ev({}))).toBeNull();
  });

  it('splits text into sentences that join back together', () => {
    const text = 'Open the Deploy page. Pick the release!\nThen promote it. Finally update DNS';
    const pieces = splitSentences(text);
    expect(pieces).toEqual(['Open the Deploy page. ', 'Pick the release!\n', 'Then promote it. ', 'Finally update DNS']);
    expect(pieces.join('')).toBe(text);
    expect(pieces.map(endsSentence)).toEqual([true, true, true, false]);
    expect(splitSentences('e.g. 5 seconds.')).toEqual(['e.g. ', '5 seconds.']);
    expect(splitSentences('')).toEqual([]);
  });

  it('turns citation markers into links, leaving code and unknown numbers alone', () => {
    expect(citationLinks('Promote [1]. Keep secrets [1][2].', 2)).toBe('Promote [1](#cite-1). Keep secrets [1](#cite-1)[2](#cite-2).');
    expect(citationLinks('Out of range [3] and zero [0].', 2)).toBe('Out of range [3] and zero [0].');
    expect(citationLinks('Use `arr[1]` here [1].', 1)).toBe('Use `arr[1]` here [1](#cite-1).');
    expect(citationLinks('```js\nconst x = arr[1];\n```\nSee [1].', 1)).toBe('```js\nconst x = arr[1];\n```\nSee [1](#cite-1).');
    // An existing link stays a link.
    expect(citationLinks('[1](https://example.com) and [1]', 1)).toBe('[1](https://example.com) and [1](#cite-1)');
  });

  it('collects the evidence an answer cites', () => {
    expect([...citedNumbers('Do this [2]. Then that [1][2].')].sort()).toEqual([1, 2]);
    expect(citedNumbers(undefined).size).toBe(0);
  });

  it('describes a stored question for the recent list', () => {
    const now = new Date().toISOString();
    expect(askedQuestionMeta({ askedAt: now, outcome: 'answered', passages: 3 })).toBe('Just now · answered · 3 passages');
    expect(askedQuestionMeta({ askedAt: now, outcome: 'passages', passages: 1 })).toBe('Just now · 1 passage');
    expect(askedQuestionMeta({ askedAt: now, outcome: 'hidden', passages: 2 })).toBe('Just now · answer hidden');
  });

  it('explains a failed deletion', () => {
    expect(deletionFailureText('residue_found')).toMatch(/still searchable/);
    expect(deletionFailureText(undefined)).toMatch(/continues where the last attempt stopped/);
  });
});

describe('editing models on a running engine', () => {
  const current = { provider: 'openai', model: 'gpt-4.1', keyKind: 'encrypted' };
  const draft = { provider: 'openai', model: 'gpt-4.1', baseUrl: '', apiVersion: '', keyMode: 'key' as const, apiKey: '', apiKeyRef: '' };

  it('keeps the stored key for an unchanged model and asks for one when it changes', () => {
    expect(isSameModel(current, draft)).toBe(true);
    expect(modelDraftError(draft, current)).toBe('');
    expect(toModelInput(draft)).toEqual({ provider: 'openai', model: 'gpt-4.1' });
    const other = { ...draft, model: 'gpt-4.1-mini' };
    expect(isSameModel(current, other)).toBe(false);
    expect(modelDraftError(other, current)).toBe('Enter an API key for this model');
    expect(modelDraftError({ ...other, apiKey: 'sk-x' }, current)).toBe('');
    expect(toModelInput({ ...other, apiKey: 'sk-x' })).toEqual({ provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'sk-x' });
  });

  it('checks key references and Azure fields', () => {
    expect(modelDraftError({ ...draft, keyMode: 'ref', apiKeyRef: 'OPENAI_KEY' }, current)).toBe('A reference looks like env:NAME or cp:ID');
    expect(toModelInput({ ...draft, keyMode: 'ref', apiKeyRef: ' env:OPENAI_KEY ' })).toEqual({ provider: 'openai', model: 'gpt-4.1', apiKeyRef: 'env:OPENAI_KEY' });
    expect(modelDraftError({ ...draft, provider: 'azure_openai', model: 'dep', apiKey: 'k' }, null)).toBe('Enter the base URL and API version');
    expect(modelDraftError({ ...draft, model: ' ' }, current)).toBe('Choose a model');
  });

  it('says how the keys are held', () => {
    expect(modelKeysLabel({ embedding: { provider: 'openai', model: 'e', keyKind: 'encrypted' }, llm: current })).toBe('Keys encrypted by the engine');
    expect(modelKeysLabel({ embedding: { provider: 'azure_openai', model: 'e', keyKind: 'reference' }, llm: null })).toBe('Keys from secret references');
    expect(modelKeysLabel({ embedding: null, llm: null })).toBe('');
  });
});
