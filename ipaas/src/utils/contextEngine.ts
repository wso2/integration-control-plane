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

import { CONNECTOR_BY_ID, CONTEXT_ENGINE_DESCRIPTION_MAX, CONTEXT_ENGINE_NAME_MAX, CONTEXT_QUERY_ACTIONS, GRAPH_STATE_LABEL, MCP_CLIENTS, PLAYGROUND_SUGGESTIONS, ROLE_GRANT_PREFIX } from '../constants/contextEngine';
import { formatDistanceToNow } from './time';
import { isEmbeddingValid } from './ragIngestion';
import type {
  ContextEngineDetail,
  ContextEngineDraft,
  ContextEngineForm,
  ContextGrant,
  ContextGraphStatus,
  ContextSourceConfig,
  CreateContextEngineInput,
  GetStartedStep,
  LlmConfig,
  McpClientConfig,
  SourceCategory,
  SourceConnector,
  SourceFieldDef,
} from '../types/contextEngine';
import type { EmbeddingConfig } from '../types/ragIngestion';

// ── Validation ──────────────────────────────────────────────────────────────

const nonEmpty = (s: string): boolean => s.trim().length > 0;

/** A URL the browser can parse with an http(s) scheme. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Split a newline/comma separated URL list, dropping blanks. */
export function splitUrls(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The catalog entry behind a configured source, or undefined for an id the catalog no longer has. */
export function connectorFor(type: string): SourceConnector | undefined {
  return CONNECTOR_BY_ID[type];
}

/** Validation message for one connector field; empty when the value is acceptable. */
export function sourceFieldError(def: SourceFieldDef, value: string | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return def.required ? `${def.label} is required.` : '';
  if (def.kind === 'url' && !isHttpUrl(v)) return 'Enter a full http(s) URL.';
  if (def.kind === 'urls') {
    const bad = splitUrls(v).find((u) => !isHttpUrl(u));
    if (bad) return `Not a valid URL: ${bad}`;
  }
  return '';
}

/** Validation message for a source's display name against its siblings; empty when acceptable. */
export function sourceNameError(name: string, otherNames: string[]): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Give this source a name.';
  if (otherNames.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase())) return 'Another source already has this name.';
  return '';
}

/** Fields of a source that are missing or invalid, in schema order. */
export function invalidSourceFields(source: ContextSourceConfig): SourceFieldDef[] {
  const connector = connectorFor(source.type);
  if (!connector) return [];
  return connector.fields.filter((f) => sourceFieldError(f, source.values[f.key]) !== '');
}

/** Whether one source names a known connector, has a name, and passes every field check. */
export function isSourceValid(source: ContextSourceConfig): boolean {
  return !!connectorFor(source.type) && nonEmpty(source.name) && invalidSourceFields(source).length === 0;
}

/** Short reason a source is incomplete, for its status chip; empty when it is complete. */
export function sourceIncompleteReason(source: ContextSourceConfig): string {
  if (!connectorFor(source.type)) return 'Unknown connector';
  if (!nonEmpty(source.name)) return 'Name missing';
  const first = invalidSourceFields(source)[0];
  if (!first) return '';
  return (source.values[first.key] ?? '').trim() ? `${first.label} invalid` : `${first.label} missing`;
}

/** Step 1 is complete with at least one valid source and no duplicate names. */
export function isSourcesStepValid(sources: ContextSourceConfig[]): boolean {
  return sourcesStepBlocker(sources) === null;
}

/** Why Next is disabled on the Sources step, or null when it may proceed. */
export function sourcesStepBlocker(sources: ContextSourceConfig[]): string | null {
  if (sources.length === 0) return 'Add at least one source to continue';
  const names = new Set(sources.map((s) => s.name.trim().toLowerCase()));
  if (names.size !== sources.length) return 'Give each source a unique name';
  const incomplete = sources.find((s) => !isSourceValid(s));
  return incomplete ? `Complete “${incomplete.name.trim() || connectorFor(incomplete.type)?.name || 'source'}” to continue` : null;
}

// ── Catalog ─────────────────────────────────────────────────────────────────

/** Connectors matching a free-text query (name, description, category) and a category filter, sorted by name. */
export function filterConnectors(connectors: SourceConnector[], query: string, category: SourceCategory | 'all'): SourceConnector[] {
  const q = query.trim().toLowerCase();
  return connectors
    .filter((c) => category === 'all' || c.category === category)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.id.includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** How many connectors each category holds (for the filter chips). */
export function connectorCountsByCategory(connectors: SourceConnector[]): Record<string, number> {
  return connectors.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.category]: (acc[c.category] ?? 0) + 1 }), {});
}

export function isLlmValid(llm: LlmConfig | null): llm is LlmConfig {
  if (!llm) return false;
  if (!nonEmpty(llm.model) || !nonEmpty(llm.apiKey)) return false;
  if (llm.provider === 'azure_openai') return isHttpUrl(llm.azureBaseUrl) && nonEmpty(llm.azureApiVersion);
  return true;
}

export function isModelsStepValid(embedding: EmbeddingConfig | null, llm: LlmConfig | null): boolean {
  return isEmbeddingValid(embedding) && isLlmValid(llm);
}

/** The embedding key can stand in for the LLM key only when both use the same provider. */
export function canShareApiKey(embedding: EmbeddingConfig | null, llm: LlmConfig | null): boolean {
  return !!embedding && !!llm && embedding.provider === llm.provider;
}

/** The LLM config as it will be submitted — with the embedding key copied in when sharing is on. */
export function effectiveLlm(form: Pick<ContextEngineForm, 'embedding' | 'llm' | 'shareApiKey'>): LlmConfig | null {
  if (!form.llm) return null;
  if (form.shareApiKey && form.embedding && canShareApiKey(form.embedding, form.llm)) return { ...form.llm, apiKey: form.embedding.apiKey };
  return form.llm;
}

/** Why the Models step cannot proceed, or null. */
export function modelsStepBlocker(form: Pick<ContextEngineForm, 'embedding' | 'llm' | 'shareApiKey'>): string | null {
  if (!form.embedding) return 'Choose an embedding model';
  if (!isEmbeddingValid(form.embedding)) return 'Complete the embedding model';
  if (!form.llm) return 'Choose a language model';
  if (!isLlmValid(effectiveLlm(form))) return 'Complete the language model';
  return null;
}

/** Empty is "no error yet"; the step gate handles required-ness. */
export function engineNameError(name: string): string {
  if (!name) return '';
  if (name.trim().length === 0) return 'Name cannot be only spaces.';
  if (name.length > CONTEXT_ENGINE_NAME_MAX) return `Name must be at most ${CONTEXT_ENGINE_NAME_MAX} characters.`;
  return '';
}

export function engineDescriptionError(description: string): string {
  return description.length > CONTEXT_ENGINE_DESCRIPTION_MAX ? `Description must be at most ${CONTEXT_ENGINE_DESCRIPTION_MAX} characters.` : '';
}

export function isNameStepValid(name: string, description: string): boolean {
  return nonEmpty(name) && !engineNameError(name) && !engineDescriptionError(description);
}

export function isFormComplete(form: ContextEngineForm): boolean {
  return isSourcesStepValid(form.sources) && modelsStepBlocker(form) === null && isNameStepValid(form.name, form.description);
}

/** The wizard form as a create request. Throws when a required section is missing — call after {@link isFormComplete}. */
export function toCreateInput(form: ContextEngineForm): CreateContextEngineInput {
  const llm = effectiveLlm(form);
  if (!form.embedding || !isLlmValid(llm)) throw new Error('Model configuration is incomplete.');
  return { name: form.name.trim(), description: form.description.trim(), sources: form.sources, roles: form.roles, embedding: form.embedding, llm };
}

/** Whether the wizard holds anything worth keeping. */
export function isFormDirty(form: ContextEngineForm): boolean {
  return form.sources.length > 0 || form.roles.length > 0 || form.embedding !== null || form.llm !== null || form.name.trim() !== '' || form.description.trim() !== '';
}

// ── Drafts ──────────────────────────────────────────────────────────────────

/** The form with every secret blanked, ready for session storage. */
export function toDraft(form: ContextEngineForm, savedAt: string): ContextEngineDraft {
  const sources = form.sources.map((s) => {
    const connector = connectorFor(s.type);
    const secretKeys = new Set((connector?.fields ?? []).filter((f) => f.kind === 'secret').map((f) => f.key));
    return { ...s, values: Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, secretKeys.has(k) ? '' : v])) };
  });
  return {
    v: 1,
    savedAt,
    form: { ...form, sources, embedding: form.embedding ? { ...form.embedding, apiKey: '' } : null, llm: form.llm ? { ...form.llm, apiKey: '' } : null },
  };
}

/** Parse a stored draft, or null when it is missing, malformed or from another version. */
export function fromDraft(raw: string | null): ContextEngineDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ContextEngineDraft>;
    const f = parsed.form;
    if (parsed.v !== 1 || !f || !Array.isArray(f.sources) || !Array.isArray(f.roles) || typeof f.name !== 'string') return null;
    return {
      v: 1,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      form: { sources: f.sources, roles: f.roles, embedding: f.embedding ?? null, llm: f.llm ?? null, shareApiKey: !!f.shareApiKey, name: f.name, description: typeof f.description === 'string' ? f.description : '' },
    };
  } catch {
    return null;
  }
}

// ── Access ──────────────────────────────────────────────────────────────────

/** Grant id for an org role: `role-<handle>`, kept within the engine's grant-id charset. */
export function roleGrantId(roleHandle: string): string {
  return `${ROLE_GRANT_PREFIX}${roleHandle.trim().replace(/[^A-Za-z0-9._:-]+/g, '-')}`;
}

/** Role handles recovered from the group grants the wizard created. */
export function rolesFromGrants(grants: ContextGrant[]): string[] {
  return grants.filter((g) => g.group && g.id.startsWith(ROLE_GRANT_PREFIX)).map((g) => g.group as string);
}

/** Whether a grant carries every action a querying role needs. */
export function grantAllowsQuery(grant: ContextGrant): boolean {
  return CONTEXT_QUERY_ACTIONS.every((a) => grant.actions.includes(a));
}

// ── Presentation ────────────────────────────────────────────────────────────

export function sourceTypeName(type: string): string {
  return connectorFor(type)?.name ?? type;
}

/** One-line description of where a source points, for the review step and overview. */
export function summarizeSource(source: ContextSourceConfig): string {
  const connector = connectorFor(source.type);
  if (!connector) return 'Unknown connector';
  if (connector.id === 'upload') return 'Upload files after the engine is created';
  const parts = connector.summaryKeys
    .map((key) => {
      const def = connector.fields.find((f) => f.key === key);
      const value = (source.values[key] ?? '').trim();
      if (!value) return '';
      if (def?.kind === 'urls') {
        const n = splitUrls(value).length;
        return `${n} URL${n === 1 ? '' : 's'}`;
      }
      return value;
    })
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Not configured yet';
}

// ── Graph status and first-run guidance ─────────────────────────────────────

/** Human status of the graph, e.g. "Not built", "Building · 2 of 3 sources", "Built 12 minutes ago". */
export function graphStatusText(graph: ContextGraphStatus): string {
  switch (graph.state) {
    case 'building':
      return graph.progress ? `Building · ${graph.progress.done} of ${graph.progress.total} sources` : 'Building';
    case 'built':
      if (!graph.builtAt) return 'Built';
      {
        const rel = formatDistanceToNow(graph.builtAt);
        return rel ? `Built ${rel.charAt(0).toLowerCase()}${rel.slice(1)}` : 'Built';
      }
    default:
      return GRAPH_STATE_LABEL[graph.state];
  }
}

export function graphStatusTone(graph: ContextGraphStatus): 'success' | 'warning' | 'info' | 'error' {
  switch (graph.state) {
    case 'built':
      return 'success';
    case 'building':
      return 'info';
    case 'failed':
      return 'error';
    default:
      return 'warning';
  }
}

/** The four first-run steps with their state; the first unfinished one is current. */
export function getStartedSteps(engine: ContextEngineDetail, asked: boolean): GetStartedStep[] {
  const done: Record<GetStartedStep['id'], boolean> = {
    build: engine.graph.state === 'built',
    ask: asked,
    publish: engine.exposure.api || engine.exposure.mcp,
    grant: engine.queryRoles.length > 0,
  };
  const n = engine.sources.length;
  const defs: Omit<GetStartedStep, 'state'>[] = [
    { id: 'build', title: 'Build the context graph', description: `Reads ${n} source${n === 1 ? '' : 's'} and creates the graph answers are drawn from.` },
    { id: 'ask', title: 'Ask it something', description: 'Try the Playground and check the cited evidence.' },
    { id: 'publish', title: 'Publish', description: 'Turn on the REST API or the MCP server for agents.' },
    { id: 'grant', title: 'Grant access', description: done.grant ? `${engine.queryRoles.length} role${engine.queryRoles.length === 1 ? '' : 's'} can query.` : 'Only you can query until roles are granted.' },
  ];
  let currentAssigned = false;
  return defs.map((d) => {
    if (done[d.id]) return { ...d, state: 'done' };
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...d, state: 'current' };
    }
    return { ...d, state: 'todo' };
  });
}

// ── Playground ──────────────────────────────────────────────────────────────

/** Questions to offer in an empty Playground, seeded from the engine's sources. */
export function suggestedQuestions(engine: Pick<ContextEngineDetail, 'sources'>): string[] {
  const names = engine.sources.map((s) => s.name).filter(Boolean);
  const out: string[] = [];
  for (const template of PLAYGROUND_SUGGESTIONS) {
    if (template.includes('{source}')) {
      for (const name of names.slice(0, 2)) out.push(template.replace('{source}', name));
    } else {
      out.push(template);
    }
  }
  return out.slice(0, 4);
}

export type AnswerPart = { kind: 'text'; text: string } | { kind: 'cite'; n: number };

/** Split an answer into text and `[n]` citation markers so the markers can link to evidence. */
export function splitCitations(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const re = /\[(\d{1,3})\]/g;
  let last = 0;
  for (const m of answer.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: 'text', text: answer.slice(last, idx) });
    parts.push({ kind: 'cite', n: Number(m[1]) });
    last = idx + m[0].length;
  }
  if (last < answer.length) parts.push({ kind: 'text', text: answer.slice(last) });
  return parts;
}

// ── Wire payloads ───────────────────────────────────────────────────────────

/** `RegisterSource` body for the engine's `POST /spaces/{id}/sources`. Credentials never travel here. */
export function toSourceRegistration(source: ContextSourceConfig): { name: string; type: string; audienceMapping: Record<string, string> } {
  return { name: source.name.trim(), type: source.type, audienceMapping: {} };
}

/** Non-secret field values — where a source points. */
function sourceSettings(source: ContextSourceConfig): Record<string, string> {
  const connector = connectorFor(source.type);
  return Object.fromEntries((connector?.fields ?? []).filter((f) => f.kind !== 'secret').map((f) => [f.key, f.kind === 'urls' ? splitUrls(source.values[f.key] ?? '').join('\n') : (source.values[f.key] ?? '').trim()]));
}

/** Secret field values, sent separately so the engine can store them as credentials. */
function sourceSecrets(source: ContextSourceConfig): Record<string, string> {
  const connector = connectorFor(source.type);
  return Object.fromEntries((connector?.fields ?? []).filter((f) => f.kind === 'secret').map((f) => [f.key, source.values[f.key] ?? '']));
}

export interface ContextEngineConfigurationPayload {
  sources: { name: string; type: string; settings: Record<string, string>; credentials: Record<string, string> }[];
  embedding: { provider: string; model: string; apiKey: string; baseUrl?: string; apiVersion?: string };
  llm: { provider: string; model: string; apiKey: string; baseUrl?: string; apiVersion?: string };
}

/** Body for the engine's `PUT /spaces/{id}/configuration` — models plus source settings and credentials. */
export function toConfigurationPayload(input: CreateContextEngineInput): ContextEngineConfigurationPayload {
  const azure = (baseUrl: string, apiVersion: string, provider: string) => (provider === 'azure_openai' ? { baseUrl, apiVersion } : {});
  return {
    sources: input.sources.map((s) => ({ name: s.name.trim(), type: s.type, settings: sourceSettings(s), credentials: sourceSecrets(s) })),
    embedding: { provider: input.embedding.provider, model: input.embedding.model, apiKey: input.embedding.apiKey, ...azure(input.embedding.azureBaseUrl, input.embedding.azureApiVersion, input.embedding.provider) },
    llm: { provider: input.llm.provider, model: input.llm.model, apiKey: input.llm.apiKey, ...azure(input.llm.azureBaseUrl, input.llm.azureApiVersion, input.llm.provider) },
  };
}

// ── Exposure snippets ───────────────────────────────────────────────────────

const trimSlash = (s: string): string => s.replace(/\/$/, '');

/** Browser-visible base of the engine API. A dev proxy path is resolved against the current origin. */
export function resolveEngineBaseUrl(configured: string, origin: string): string {
  const base = trimSlash(configured);
  if (!base) return '';
  return base.startsWith('/') ? `${trimSlash(origin)}${base}` : base;
}

export function queryEndpointUrl(baseUrl: string): string {
  return `${trimSlash(baseUrl)}/v1/queries`;
}

export function mcpEndpointUrl(baseUrl: string): string {
  return `${trimSlash(baseUrl)}/v1/mcp`;
}

export function buildQueryCurl(baseUrl: string, engineId: string, question = 'What is our rollback procedure?'): string {
  const body = JSON.stringify({ spaceId: engineId, question, mode: 'answer', limit: 5 }, null, 2);
  return `curl -X POST ${queryEndpointUrl(baseUrl)} \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
}

/** An MCP client `mcpServers` entry pointing at this engine, ready to paste into a client config. */
export function buildMcpClientConfig(baseUrl: string, engineId: string, engineName: string): string {
  const key = engineName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return JSON.stringify(
    {
      mcpServers: {
        [key || 'context-engine']: {
          url: mcpEndpointUrl(baseUrl),
          headers: { Authorization: 'Bearer <token>', 'X-Context-Space': engineId },
        },
      },
    },
    null,
    2,
  );
}

/** The same server entry shaped for each supported client. */
export function buildMcpClientConfigs(baseUrl: string, engineId: string, engineName: string): McpClientConfig[] {
  const key =
    engineName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63) || 'context-engine';
  const server = { url: mcpEndpointUrl(baseUrl), headers: { Authorization: 'Bearer <token>', 'X-Context-Space': engineId } };
  return MCP_CLIENTS.map((c) => ({
    ...c,
    json: JSON.stringify(c.id === 'vscode' ? { servers: { [key]: { type: 'http', ...server } } } : { mcpServers: { [key]: server } }, null, 2),
  }));
}
