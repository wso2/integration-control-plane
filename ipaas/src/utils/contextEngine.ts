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

import { CONNECTOR_BY_ID, CONTEXT_ENGINE_DESCRIPTION_MAX, CONTEXT_ENGINE_NAME_MAX, CONTEXT_QUERY_ACTIONS, ROLE_GRANT_PREFIX } from '../constants/contextEngine';
import { isEmbeddingValid } from './ragIngestion';
import type { ContextEngineForm, ContextGrant, ContextSourceConfig, CreateContextEngineInput, LlmConfig, SourceCategory, SourceConnector, SourceFieldDef } from '../types/contextEngine';
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
  return isSourcesStepValid(form.sources) && isModelsStepValid(form.embedding, form.llm) && isNameStepValid(form.name, form.description);
}

/** The wizard form as a create request. Throws when a required section is missing — call after {@link isFormComplete}. */
export function toCreateInput(form: ContextEngineForm): CreateContextEngineInput {
  if (!form.embedding || !isLlmValid(form.llm)) throw new Error('Model configuration is incomplete.');
  return { name: form.name.trim(), description: form.description.trim(), sources: form.sources, roles: form.roles, embedding: form.embedding, llm: form.llm };
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
