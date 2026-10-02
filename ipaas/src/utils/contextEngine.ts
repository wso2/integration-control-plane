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

import {
  CONNECTOR_BY_ID,
  CONTEXT_ENGINE_DESCRIPTION_MAX,
  CONTEXT_ENGINE_NAME_MAX,
  CONTEXT_QUERY_ACTIONS,
  OWNER_GRANT_PREFIX,
  defaultStorage,
  GRAPH_STATE_LABEL,
  MCP_CLIENTS,
  PLAYGROUND_SUGGESTIONS,
  ROLE_GRANT_PREFIX,
  STORAGE_BACKEND_BY_KIND,
  STORAGE_BACKENDS,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_MAX_BYTES,
} from '../constants/contextEngine';
import { hasStagedFile } from './stagedFiles';
import { HttpError } from '../types/http';
import { formatDistanceToNow } from './time';
import { isEmbeddingValid } from './ragIngestion';
import type {
  AudienceRule,
  ContextEngineDetail,
  ContextEngineDraft,
  ContextEngineForm,
  ContextEngineProgress,
  ContextEngineProgressSummary,
  ContextEngineStorage,
  ContextGrant,
  ContextGraphStatus,
  ContextJob,
  ContextRecordStatus,
  ContextSource,
  ContextSourceConfig,
  CreateContextEngineInput,
  FileVisibility,
  GetStartedStep,
  LlmConfig,
  McpClientConfig,
  SourceCategory,
  SourceConnector,
  SourceFieldDef,
  SourceProgress,
  UploadedFile,
  SourceProgressStatus,
  StagedFileCheck,
  StagedFileMeta,
  StorageKind,
  StorageSelection,
  UploadEntry,
  UploadFileStatus,
} from '../types/contextEngine';
import type { EmbeddingConfig } from '../types/ragIngestion';

// ── Validation ──────────────────────────────────────────────────────────────

const nonEmpty = (s: string): boolean => s.trim().length > 0;

const plural = (n: number, word: string): string => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

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

/** Rules with anything typed in; fully blank rows are placeholders and ignored. */
const typedRules = (rules: AudienceRule[] | undefined): AudienceRule[] => (rules ?? []).filter((r) => nonEmpty(r.group) || nonEmpty(r.role));

/**
 * Why a source's visibility rules are unusable, or '' when they are fine. The
 * engine quarantines items whose groups have no rule and nobody reads items
 * without an audience, so a source needs at least one complete rule.
 */
export function audienceError(rules: AudienceRule[] | undefined): string {
  const typed = typedRules(rules);
  if (typed.length === 0) return 'Map at least one group to a role, or nobody will see this content.';
  if (typed.some((r) => !nonEmpty(r.group) || !nonEmpty(r.role))) return 'Finish or remove the half-filled rule.';
  const groups = typed.map((r) => r.group.trim());
  if (new Set(groups).size !== groups.length) return 'Each group can map to one role only.';
  return '';
}

/**
 * Why a File Upload source's staged files cannot be sent yet, or '' when they can.
 * Files are optional in the wizard; "only some roles" needs a role, and a
 * restored draft needs the files' bytes again.
 */
export function stagedBlocker(source: ContextSourceConfig): string {
  const staged = source.staged ?? [];
  if (staged.length === 0) return '';
  if (visibilityError(source.stagedVisibility)) return 'Choose who can see the files';
  const missing = staged.filter((f) => !hasStagedFile(f.id)).length;
  return missing > 0 ? `Re-add ${plural(missing, 'file')}` : '';
}

/** Whether a source needs visibility rules typed in: connectors do; File Upload sources get theirs from the roles each upload is shared with. */
export const needsAudienceRules = (source: Pick<ContextSourceConfig, 'type'>): boolean => source.type !== 'upload';

/** Whether one source names a known connector, has a name, passes every field check, has visibility rules and its staged files are ready. */
export function isSourceValid(source: ContextSourceConfig): boolean {
  return !!connectorFor(source.type) && nonEmpty(source.name) && invalidSourceFields(source).length === 0 && (!needsAudienceRules(source) || audienceError(source.audience) === '') && stagedBlocker(source) === '';
}

/** Short reason a source is incomplete, for its status chip; empty when it is complete. */
export function sourceIncompleteReason(source: ContextSourceConfig): string {
  if (!connectorFor(source.type)) return 'Unknown connector';
  if (!nonEmpty(source.name)) return 'Name missing';
  const first = invalidSourceFields(source)[0];
  if (first) return (source.values[first.key] ?? '').trim() ? `${first.label} invalid` : `${first.label} missing`;
  if (needsAudienceRules(source) && audienceError(source.audience)) return typedRules(source.audience).length ? 'Visibility incomplete' : 'Visibility missing';
  return stagedBlocker(source);
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
  return isSourcesStepValid(form.sources) && modelsStepBlocker(form) === null && storageStepBlocker(form.storage) === null && isNameStepValid(form.name, form.description);
}

/** The wizard form as a create request. Throws when a required section is missing — call after {@link isFormComplete}. */
export function toCreateInput(form: ContextEngineForm): CreateContextEngineInput {
  const llm = effectiveLlm(form);
  if (!form.embedding || !isLlmValid(llm)) throw new Error('Model configuration is incomplete.');
  return { name: form.name.trim(), description: form.description.trim(), sources: form.sources, roles: form.roles, embedding: form.embedding, llm, storage: form.storage };
}

/** Whether the wizard holds anything worth keeping. */
export function isFormDirty(form: ContextEngineForm): boolean {
  return form.sources.length > 0 || form.roles.length > 0 || form.embedding !== null || form.llm !== null || !isStorageAllManaged(form.storage) || form.name.trim() !== '' || form.description.trim() !== '';
}

// ── Drafts ──────────────────────────────────────────────────────────────────

/** The form with every secret blanked, ready for session storage. */
export function toDraft(form: ContextEngineForm, savedAt: string): ContextEngineDraft {
  const sources = form.sources.map((s) => {
    const connector = connectorFor(s.type);
    const secretKeys = new Set((connector?.fields ?? []).filter((f) => f.kind === 'secret').map((f) => f.key));
    return { ...s, values: Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, secretKeys.has(k) ? '' : v])) };
  });
  const storage = Object.fromEntries(Object.entries(form.storage).map(([k, sel]) => [k, sel.mode === 'external' ? { ...sel, password: '' } : sel])) as ContextEngineStorage;
  return {
    v: 1,
    savedAt,
    form: { ...form, sources, storage, embedding: form.embedding ? { ...form.embedding, apiKey: '' } : null, llm: form.llm ? { ...form.llm, apiKey: '' } : null },
  };
}

/** A source restored from storage, with every field coerced to its shape; drafts saved before visibility rules existed get one blank rule. */
function sanitizeSourceConfig(raw: unknown): ContextSourceConfig {
  const r = (raw ?? {}) as Partial<ContextSourceConfig>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const values = r.values && typeof r.values === 'object' ? Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, str(v)])) : {};
  const audience = Array.isArray(r.audience) ? r.audience.map((a) => ({ group: str((a as Partial<AudienceRule>)?.group), role: str((a as Partial<AudienceRule>)?.role) })) : [];
  const staged = Array.isArray(r.staged)
    ? r.staged
        .map((f) => ({ id: str((f as Partial<StagedFileMeta>)?.id), name: str((f as Partial<StagedFileMeta>)?.name), size: Number((f as Partial<StagedFileMeta>)?.size) || 0, contentType: str((f as Partial<StagedFileMeta>)?.contentType) }))
        .filter((f) => f.id && f.name)
    : [];
  return { type: str(r.type), name: str(r.name), values, audience: audience.length ? audience : [{ group: '', role: '' }], ...(staged.length ? { staged, stagedVisibility: sanitizeVisibility(r.stagedVisibility) } : {}) };
}

/** A stored visibility choice, coerced; anything unreadable, including a draft's old label, becomes everyone who can query. */
function sanitizeVisibility(raw: unknown): FileVisibility {
  const v = (raw ?? {}) as { kind?: unknown; roles?: unknown };
  if (v.kind === 'roles' && Array.isArray(v.roles)) return { kind: 'roles', roles: v.roles.filter((x): x is string => typeof x === 'string') };
  return { kind: 'everyone' };
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
      form: {
        sources: f.sources.map(sanitizeSourceConfig),
        roles: f.roles,
        embedding: f.embedding ?? null,
        llm: f.llm ?? null,
        shareApiKey: !!f.shareApiKey,
        storage: sanitizeStorage(f.storage),
        name: f.name,
        description: typeof f.description === 'string' ? f.description : '',
      },
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

/** Grant id for the engine's creator: `owner-<principalId>`, within the engine's grant-id charset. */
export function ownerGrantId(principalId: string): string {
  return `${OWNER_GRANT_PREFIX}${principalId.trim().replace(/[^A-Za-z0-9._:-]+/g, '-')}`;
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
  if (connector.id === 'upload') {
    const staged = source.staged ?? [];
    if (staged.length === 0) return 'Upload files after the engine is created';
    const sum = stagedSummary(staged, []);
    return `${plural(staged.length, 'file')} staged · ${formatBytes(sum.bytes)}${sum.pdfs ? ` · ${plural(sum.pdfs, 'PDF')} stored only` : ''}`;
  }
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

/** Visibility rules in one line, e.g. "engineering → admin · support → developer". */
export function summarizeAudience(rules: AudienceRule[] | undefined, roleNames: Record<string, string> = {}): string {
  const typed = typedRules(rules).filter((r) => nonEmpty(r.group) && nonEmpty(r.role));
  if (typed.length === 0) return 'Not visible to anyone yet';
  return typed.map((r) => `${r.group.trim()} → ${roleNames[r.role] ?? r.role}`).join(' · ');
}

/** Human position of a passage in its item: the engine reports chunks as `chunk:<n>` from zero. */
export function evidenceLocationLabel(location: string | undefined): string {
  if (!location) return '';
  const m = /^chunk:(\d+)$/.exec(location);
  return m ? `Part ${Number(m[1]) + 1}` : location;
}

// ── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KINDS: StorageKind[] = ['vector', 'relational', 'graph'];

/** A Neo4j connection URI: bolt://, bolt+s://, neo4j://, neo4j+s:// or http(s)://. */
export function isGraphUri(value: string): boolean {
  return /^(bolt|bolt\+s|bolt\+ssc|neo4j|neo4j\+s|neo4j\+ssc|https?):\/\/\S+$/i.test(value.trim());
}

/** Coerce a stored or foreign storage object to a complete, well-typed one; anything odd falls back to managed. */
export function sanitizeStorage(raw: unknown): ContextEngineStorage {
  const base = defaultStorage();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, Partial<Record<string, unknown>> | undefined>;
  for (const kind of STORAGE_KINDS) {
    const sel = obj[kind];
    if (!sel || typeof sel !== 'object') continue;
    if (sel.mode === 'infrastructure') base[kind] = { mode: 'infrastructure', serverId: String(sel.serverId ?? ''), serverName: String(sel.serverName ?? ''), database: String(sel.database ?? '') };
    else if (sel.mode === 'external') base[kind] = { mode: 'external', uri: String(sel.uri ?? ''), database: String(sel.database ?? ''), user: String(sel.user ?? ''), password: String(sel.password ?? '') };
  }
  return base;
}

export function isStorageAllManaged(storage: ContextEngineStorage): boolean {
  return STORAGE_KINDS.every((k) => storage[k].mode === 'managed');
}

/** Why one store's selection is incomplete; empty when it is usable. */
export function storageSelectionError(kind: StorageKind, sel: StorageSelection): string {
  const info = STORAGE_BACKEND_BY_KIND[kind];
  switch (sel.mode) {
    case 'managed':
      return '';
    case 'infrastructure':
      if (!sel.serverId) return `Choose a ${info.infraNoun} server, or switch to Engine managed`;
      if (!nonEmpty(sel.database)) return `Enter the database to use on ${sel.serverName || 'the server'}`;
      return '';
    case 'external':
      if (!nonEmpty(sel.uri)) return 'Enter the connection URI';
      if (!isGraphUri(sel.uri)) return 'Enter a bolt://, neo4j:// or http(s):// URI';
      if (!nonEmpty(sel.database) || !nonEmpty(sel.user) || !nonEmpty(sel.password)) return 'Enter the database, user and password';
      return '';
  }
}

/** Why Next is disabled on the Storage step, or null when every store is usable. */
export function storageStepBlocker(storage: ContextEngineStorage): string | null {
  for (const kind of STORAGE_KINDS) {
    const err = storageSelectionError(kind, storage[kind]);
    if (err) return err;
  }
  return null;
}

/** Two lines describing where a store lives, for the review step and overview. */
export function summarizeStorage(kind: StorageKind, sel: StorageSelection): { primary: string; secondary: string } {
  const info = STORAGE_BACKEND_BY_KIND[kind];
  switch (sel.mode) {
    case 'managed':
      return { primary: 'Engine managed', secondary: `${info.managedName} · embedded` };
    case 'infrastructure':
      return { primary: sel.serverName || 'Infrastructure server', secondary: `${info.alternativeProvider} · ${sel.database || 'database not set'}` };
    case 'external': {
      let host = sel.uri.trim();
      try {
        host = new URL(sel.uri.trim()).host || host;
      } catch {
        /* keep the raw uri */
      }
      return { primary: 'Neo4j', secondary: `${host || 'URI not set'} · ${sel.database || 'database not set'}` };
    }
  }
}

/** Connection details resolved from an Infrastructure server at create time. */
export interface ResolvedConnection {
  host: string;
  port: string;
  user: string;
  password: string;
  sslRequired?: boolean;
}

export type StoragePayload =
  | { provider: string }
  | { provider: string; serverId: string; serverName: string; host: string; port: string; database: string; user: string; password: string; sslRequired?: boolean }
  | { provider: string; uri: string; database: string; user: string; password: string };

/** One store as the engine's configuration route expects it; Infrastructure servers need their resolved connection. */
export function toStoragePayload(kind: StorageKind, sel: StorageSelection, connection?: ResolvedConnection): StoragePayload {
  const info = STORAGE_BACKEND_BY_KIND[kind];
  switch (sel.mode) {
    case 'managed':
      return { provider: info.managedProvider };
    case 'infrastructure': {
      if (!connection) throw new Error(`Connection details for ${sel.serverName || sel.serverId} were not resolved.`);
      return {
        provider: info.alternativeProvider,
        serverId: sel.serverId,
        serverName: sel.serverName,
        host: connection.host,
        port: connection.port,
        database: sel.database.trim(),
        user: connection.user,
        password: connection.password,
        ...(connection.sslRequired !== undefined ? { sslRequired: connection.sslRequired } : {}),
      };
    }
    case 'external':
      return { provider: info.alternativeProvider, uri: sel.uri.trim(), database: sel.database.trim(), user: sel.user.trim(), password: sel.password };
  }
}

/** Storage kinds whose selection points at an Infrastructure server. */
export function infrastructureStorageKinds(storage: ContextEngineStorage): StorageKind[] {
  return STORAGE_BACKENDS.map((b) => b.kind).filter((k) => storage[k].mode === 'infrastructure');
}

// ── Source progress ─────────────────────────────────────────────────────────

/** Lower-cased relative time, e.g. "3 min ago"; empty when the timestamp cannot be parsed. */
const ago = (iso: string): string => {
  const rel = formatDistanceToNow(iso);
  return rel ? `${rel.charAt(0).toLowerCase()}${rel.slice(1)}` : '';
};

/** Floor, so a source is never shown at 100% while something is still in flight. */
export function formatProgressPercent(percent: number): string {
  return `${Math.floor(Math.min(Math.max(percent, 0), 100))}%`;
}

/**
 * Where a source is in the pipeline. A connector that is still reading wins over
 * queued work, queued work wins over indexing, and a source that finished with
 * failed or quarantined items needs attention.
 */
export function sourceProgressStatus(p: SourceProgress): SourceProgressStatus {
  if (p.reading.state === 'reading') return 'reading';
  if (p.processing.queued + p.processing.running > 0) return 'processing';
  if (p.indexing.state === 'ok' && (p.indexing.indexing ?? 0) > 0) return 'indexing';
  if (p.reading.state === 'idle' && p.processing.total === 0 && p.records.active === 0) return 'waiting';
  if (p.processing.failed > 0 || p.records.quarantined > 0 || (p.indexing.state === 'ok' && (p.indexing.failed ?? 0) > 0)) return 'attention';
  return 'processed';
}

export function isSourceProgressActive(p: SourceProgress): boolean {
  const status = sourceProgressStatus(p);
  return status === 'reading' || status === 'processing' || status === 'indexing';
}

export function isEngineProgressActive(progress: ContextEngineProgress | undefined): boolean {
  return !!progress?.available && progress.sources.some(isSourceProgressActive);
}

/**
 * Bar value for one source, or null for an indeterminate bar. While the connector
 * is still reading the total is unknown, so there is no honest percentage: the
 * engine reports none for reading by design. Indexing shows the backend's figure.
 */
export function sourceProgressValue(p: SourceProgress): number | null {
  const status = sourceProgressStatus(p);
  if (status === 'waiting') return 0;
  if (status === 'reading') return null;
  if (status === 'indexing') return p.indexing.percent ?? 0;
  return p.processing.percent ?? 100;
}

/** Item counts under a source's bar, e.g. "540 of 1,200 items processed · 2 failed · 538 records stored" ("so far" while still reading). */
export function sourceProgressDetail(p: SourceProgress): string {
  if (sourceProgressStatus(p) === 'waiting') return 'No sync has started yet. Items appear here once the connector delivers them.';
  const { total, succeeded, failed } = p.processing;
  const parts: string[] = [];
  if (total > 0) parts.push(`${(succeeded + failed).toLocaleString('en-US')} of ${plural(total, 'item')} processed${p.reading.state === 'reading' ? ' so far' : ''}`);
  else parts.push(p.reading.state === 'reading' ? 'Nothing delivered yet' : 'No new items in the latest sync');
  if (failed > 0) parts.push(`${failed.toLocaleString('en-US')} failed`);
  if (p.records.quarantined > 0) parts.push(`${p.records.quarantined.toLocaleString('en-US')} quarantined`);
  parts.push(`${plural(p.records.active, 'record')} stored`);
  return parts.join(' · ');
}

/** Sync timing, e.g. "Last sync finished 3 min ago"; null when the connector has never synced. */
export function sourceSyncText(p: SourceProgress): string | null {
  if (p.reading.state === 'reading' && p.reading.startedAt) return `Still reading · sync started ${ago(p.reading.startedAt)}`.trim();
  if (p.reading.state === 'completed' && p.reading.completedAt) return `Last sync finished ${ago(p.reading.completedAt)}`.trim();
  return null;
}

/** Search-index line; null until the engine has collected indexing status for the source. */
export function sourceIndexingText(p: SourceProgress): string | null {
  const ix = p.indexing;
  if (ix.state === 'unavailable') return 'Search index status is unavailable right now';
  if (ix.state !== 'ok' || !ix.expected) return null;
  const parts = [`${ix.percent !== null ? formatProgressPercent(ix.percent) : '0%'} indexed (${(ix.indexed ?? 0).toLocaleString('en-US')} of ${ix.expected.toLocaleString('en-US')})`];
  if (ix.failed) parts.push(`${ix.failed.toLocaleString('en-US')} failed`);
  if (ix.missing) parts.push(`${ix.missing.toLocaleString('en-US')} missing`);
  return parts.join(' · ');
}

/** Roll-up across the engine's sources. Sources without a progress entry are ones the caller may not inspect. */
export function summarizeEngineProgress(sourceIds: string[], progress: SourceProgress[]): ContextEngineProgressSummary {
  const byId = new Map(progress.map((p) => [p.sourceId, p]));
  const sum: ContextEngineProgressSummary = { sourceCount: sourceIds.length, processed: 0, active: 0, reading: 0, waiting: 0, hidden: 0, percent: null, failedItems: 0 };
  let delivered = 0;
  let finished = 0;
  for (const id of sourceIds) {
    const p = byId.get(id);
    if (!p) {
      sum.hidden += 1;
      continue;
    }
    const status = sourceProgressStatus(p);
    if (status === 'processed' || status === 'attention') sum.processed += 1;
    else if (status === 'waiting') sum.waiting += 1;
    else sum.active += 1;
    if (status === 'reading') sum.reading += 1;
    delivered += p.processing.total;
    finished += p.processing.succeeded + p.processing.failed;
    sum.failedItems += p.processing.failed;
  }
  sum.percent = delivered > 0 ? Math.round((Math.min(finished, delivered) * 1000) / delivered) / 10 : null;
  return sum;
}

/**
 * The whole-engine bar while sources move, following the earliest stage any source
 * is in: indeterminate while a connector reads (totals are not final), the share
 * of delivered items processed while work is queued, then the share of stored
 * records indexed. Null when nothing is moving.
 */
export function overallProgress(progress: SourceProgress[]): { value: number | null; text: string } | null {
  const statuses = progress.map(sourceProgressStatus);
  const delivered = progress.reduce((n, p) => n + p.processing.total, 0);
  const finished = progress.reduce((n, p) => n + p.processing.succeeded + p.processing.failed, 0);
  const processed = delivered > 0 ? (Math.min(finished, delivered) * 100) / delivered : null;
  if (statuses.includes('reading')) return { value: null, text: processed !== null ? `${formatProgressPercent(processed)} of delivered items processed so far` : 'Waiting for the first items' };
  if (statuses.includes('processing')) return { value: processed ?? 0, text: `${formatProgressPercent(processed ?? 0)} of delivered items processed` };
  if (statuses.includes('indexing')) {
    const indexed = progress.filter((p) => p.indexing.state === 'ok' && p.indexing.expected);
    const expected = indexed.reduce((n, p) => n + (p.indexing.expected ?? 0), 0);
    const done = indexed.reduce((n, p) => n + (p.indexing.indexed ?? 0), 0);
    const value = expected > 0 ? (Math.min(done, expected) * 100) / expected : 0;
    return { value, text: `${formatProgressPercent(value)} of stored records indexed` };
  }
  return null;
}

/** Card header text, e.g. "2 of 3 sources processed". */
export function progressHeadline(s: ContextEngineProgressSummary): string {
  const visible = s.sourceCount - s.hidden;
  if (visible === 0) return s.sourceCount === 0 ? 'No sources' : 'Progress hidden';
  return `${s.processed} of ${plural(visible, 'source')} processed`;
}

/**
 * Compact listing text: syncing (with a percentage once no connector is still
 * reading), a processed count, or waiting. Null when there is nothing to say.
 */
export function progressListingText(s: ContextEngineProgressSummary | null): string | null {
  if (!s || s.sourceCount === 0 || s.sourceCount === s.hidden) return null;
  if (s.active > 0) return s.percent !== null && s.reading === 0 ? `Syncing · ${formatProgressPercent(s.percent)}` : 'Syncing';
  if (s.processed === 0) return 'Waiting for data';
  return `${s.processed} of ${s.sourceCount - s.hidden} processed`;
}

// ── File uploads ────────────────────────────────────────────────────────────

/** The content type the engine will see for a file: by extension first, since browsers leave `File.type` empty for Markdown. */
export function contentTypeForFile(name: string, browserType = ''): string {
  const dot = name.lastIndexOf('.');
  const byExt = dot >= 0 ? UPLOAD_CONTENT_TYPES[name.slice(dot + 1).toLowerCase()] : undefined;
  if (byExt) return byExt;
  const base = browserType.split(';')[0].trim().toLowerCase();
  return Object.values(UPLOAD_CONTENT_TYPES).includes(base) ? base : '';
}

/** "3.2 KB", "4.8 MB", "25 MB": one decimal unless it is zero. */
export function formatBytes(n: number): string {
  const one = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ''));
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${one(n / 1024)} KB`;
  return `${one(n / (1024 * 1024))} MB`;
}

/** What to say about a chosen file before it is sent. */
export function checkStagedFile(meta: Pick<StagedFileMeta, 'name' | 'size' | 'contentType'>, existingNames: string[]): StagedFileCheck {
  const replaces = existingNames.includes(meta.name);
  if (!meta.contentType) return { problem: 'unsupported', replaces };
  if (meta.size > UPLOAD_MAX_BYTES) return { problem: 'too-large', replaces };
  return meta.contentType === 'application/pdf' ? { warning: 'pdf', replaces } : { replaces };
}

/** The row's caption for a check; '' when there is nothing to say. */
export function stagedFileNote(check: StagedFileCheck, size: number): string {
  if (check.problem === 'too-large') return `${formatBytes(size)} is over the ${formatBytes(UPLOAD_MAX_BYTES)} limit. Split it or leave it out.`;
  if (check.problem === 'unsupported') return 'Only text, Markdown, HTML, JSON or PDF files can be uploaded.';
  const notes: string[] = [];
  if (check.warning === 'pdf') notes.push('Stored, but not searchable until the engine can read PDFs');
  if (check.replaces) notes.push('Replaces the version already in the source');
  return notes.join(' · ');
}

/** How many of the chosen files will upload, how many are skipped, and their size. */
export function stagedSummary(files: Pick<StagedFileMeta, 'name' | 'size' | 'contentType'>[], existingNames: string[]): { ready: number; skipped: number; bytes: number; pdfs: number } {
  const sum = { ready: 0, skipped: 0, bytes: 0, pdfs: 0 };
  for (const f of files) {
    const check = checkStagedFile(f, existingNames);
    if (check.problem) {
      sum.skipped += 1;
      continue;
    }
    sum.ready += 1;
    sum.bytes += f.size;
    if (check.warning === 'pdf') sum.pdfs += 1;
  }
  return sum;
}

// ── Upload visibility ───────────────────────────────────────────────────────
// Uploaded files are shared with roles directly. The UI tags each file with role
// handles and keeps the File Upload source's rules mapping every handle to itself,
// so nobody has to invent a label and then map it.

const uniqueTrimmed = (xs: string[]): string[] => xs.map((x) => x.trim()).filter((x, i, all) => x !== '' && all.indexOf(x) === i);

/** "a", "a and b", "a, b and c", with role handles shown by name. */
function nameList(roles: string[], roleNames: Record<string, string>): string {
  const names = roles.map((r) => roleNames[r] ?? r);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The role handles "everyone who can query" stands for: every org role plus the
 * roles granted query access. Query access still decides who may ask; tagging a
 * file with every role only means no asker is filtered out, including roles
 * granted later. When org roles could not be loaded, the granted roles and the
 * uploader's own groups stand in.
 */
export function everyoneRoles(orgRoles: string[] | undefined, queryRoles: string[], myGroups: string[] = []): string[] {
  return orgRoles && orgRoles.length > 0 ? uniqueTrimmed([...orgRoles, ...queryRoles]) : uniqueTrimmed([...queryRoles, ...myGroups]);
}

/** The audience tags a file is sent with: the chosen roles, or every role for everyone who can query. */
export function visibilityTags(visibility: FileVisibility | undefined, everyone: string[]): string[] {
  return visibility?.kind === 'roles' ? uniqueTrimmed(visibility.roles) : uniqueTrimmed(everyone);
}

/** A File Upload source's rules: each role handle maps to itself. */
export function uploadSourceRules(roles: string[]): AudienceRule[] {
  return uniqueTrimmed(roles).map((role) => ({ group: role, role }));
}

/** Every File Upload source gets rules mapping the given roles to themselves; other sources keep their own. */
export function withUploadRules(sources: ContextSourceConfig[], roles: string[]): ContextSourceConfig[] {
  return sources.map((s) => (s.type === 'upload' ? { ...s, audience: uploadSourceRules(roles) } : s));
}

/** Why a visibility choice cannot be used, or '' when it can: "only some roles" needs at least one. */
export function visibilityError(visibility: FileVisibility | undefined): string {
  return visibility?.kind === 'roles' && uniqueTrimmed(visibility.roles).length === 0 ? 'Choose at least one role' : '';
}

/** "Everyone who can query", or the chosen roles by name. */
export function describeVisibility(visibility: FileVisibility | undefined, roleNames: Record<string, string> = {}): string {
  if (!visibility || visibility.kind === 'everyone') return 'Everyone who can query';
  const roles = uniqueTrimmed(visibility.roles);
  return roles.length ? roles.map((r) => roleNames[r] ?? r).join(', ') : 'No roles chosen';
}

/** Who can see an uploaded file, for its row; a file uploaded before roles were chosen shows its label. */
export function describeUploadAudience(entry: Pick<UploadedFile, 'visibility' | 'label'>, roleNames: Record<string, string> = {}): string {
  if (entry.visibility) return describeVisibility(entry.visibility, roleNames);
  return entry.label ? `Label “${entry.label}”` : 'Everyone who can query';
}

/** Who a source's content reaches, for the wizard's rows: connectors by their rules, uploads by the files' choice. */
export function summarizeSourceVisibility(source: ContextSourceConfig, roleNames: Record<string, string> = {}): string {
  return needsAudienceRules(source) ? summarizeAudience(source.audience, roleNames) : describeVisibility(source.stagedVisibility, roleNames);
}

/**
 * Where a visibility choice will surprise its owner: chosen roles that cannot
 * query the engine, and an uploader who is in none of the roles. `queryRoles`
 * is left out where query access is not chosen yet; `myGroups` when unknown.
 */
export function visibilityWarnings(input: { visibility: FileVisibility | undefined; everyone: string[]; queryRoles?: string[]; myGroups?: string[]; roleNames?: Record<string, string> }): string[] {
  const { visibility, everyone, queryRoles, myGroups, roleNames = {} } = input;
  const tags = visibilityTags(visibility, everyone);
  const warnings: string[] = [];
  if (visibility?.kind === 'roles' && queryRoles) {
    const cannotQuery = tags.filter((r) => !queryRoles.includes(r));
    if (cannotQuery.length) warnings.push(`${nameList(cannotQuery, roleNames)} can't query this engine, so ${cannotQuery.length === 1 ? 'it' : 'they'} won't find these files until granted access.`);
  }
  if (myGroups && myGroups.length > 0 && tags.length > 0 && !tags.some((t) => myGroups.includes(t))) warnings.push("You aren't in any of these roles, so these files won't show in your own answers.");
  return warnings;
}

/** Where who-can-query and who-can-see disagree across a whole engine, for the review step. */
export interface SharingMismatches {
  /** Roles with query access that no source shares anything with: they get empty answers. */
  seeNothing: string[];
  /** Roles a source shares content with by name that cannot query: the sharing has no effect. */
  cannotQuery: string[];
  /** Sources whose content the creator is in none of the roles for. */
  hiddenFromMe: string[];
}

/** The roles a source shares content with: a connector's mapped roles, an upload's chosen roles or everyone. */
function sourceSharedRoles(source: ContextSourceConfig, everyone: string[]): string[] {
  if (!needsAudienceRules(source)) return visibilityTags(source.stagedVisibility, everyone);
  return uniqueTrimmed(
    typedRules(source.audience)
      .filter((r) => nonEmpty(r.group) && nonEmpty(r.role))
      .map((r) => r.role),
  );
}

export function sharingMismatches(sources: ContextSourceConfig[], queryRoles: string[], everyone: string[], myGroups: string[] = []): SharingMismatches {
  const shared = new Set(sources.flatMap((s) => sourceSharedRoles(s, everyone)));
  // "Everyone who can query" names every role on purpose, so only explicit choices can name a role that cannot query.
  const named = new Set(sources.filter((s) => needsAudienceRules(s) || s.stagedVisibility?.kind === 'roles').flatMap((s) => sourceSharedRoles(s, everyone)));
  return {
    seeNothing: queryRoles.filter((r) => !shared.has(r)),
    cannotQuery: [...named].filter((r) => !queryRoles.includes(r)),
    hiddenFromMe: myGroups.length ? sources.filter((s) => !sourceSharedRoles(s, everyone).some((r) => myGroups.includes(r))).map((s) => s.name.trim()) : [],
  };
}

/** Role handles as a readable list, for warnings. */
export const roleList = nameList;

/** Where an uploaded file stands once the engine has taken it, from its record status. */
export function uploadStatusFromRecord(record: ContextRecordStatus): { status: UploadFileStatus; detail?: string } {
  if (record.state === 'quarantined') {
    return {
      status: 'held',
      detail:
        record.quarantineReason === 'unmapped_audience'
          ? "The source has no rule for this file's roles yet, so nobody can see it. Someone who manages the source can fix it by changing who can see the file."
          : `Held back: ${record.quarantineReason ?? 'unknown reason'}.`,
    };
  }
  if (record.state === 'deleted') return { status: 'failed', detail: 'This file was removed from the engine.' };
  switch (record.indexState) {
    case 'indexed':
      return { status: 'searchable' };
    case 'pending':
      return { status: 'indexing' };
    case 'reconcile_required':
      return { status: 'indexing', detail: 'The engine is repairing its index entry for this file.' };
    case 'failed':
      return record.indexError === 'extraction_unsupported'
        ? { status: 'unreadable', detail: "Stored, but the engine can't read this file type yet. Upload a text or Markdown export to make it searchable." }
        : { status: 'failed', detail: `Indexing failed${record.indexError ? `: ${record.indexError}` : ''}.` };
    case 'not_indexed':
      return { status: 'stored', detail: 'The engine is running without its knowledge backend, so nothing is searchable yet.' };
    default:
      return { status: 'indexing' };
  }
}

export function isUploadActive(entry: Pick<UploadEntry, 'status'>): boolean {
  return entry.status === 'uploading' || entry.status === 'queued' || entry.status === 'indexing';
}

/** Header line for a source's files, e.g. "6 files · 4 searchable · 1 held back · 1 not readable". */
export function summarizeUploads(entries: Pick<UploadEntry, 'status'>[]): string {
  if (entries.length === 0) return 'No files yet';
  const count = (s: UploadFileStatus): number => entries.filter((e) => e.status === s).length;
  const parts = [plural(entries.length, 'file')];
  const moving = entries.filter(isUploadActive).length;
  if (moving) parts.push(`${moving} in progress`);
  if (count('searchable')) parts.push(`${count('searchable')} searchable`);
  if (count('stored')) parts.push(`${count('stored')} stored only`);
  if (count('unreadable')) parts.push(`${count('unreadable')} not readable`);
  if (count('held')) parts.push(`${count('held')} held back`);
  if (count('failed')) parts.push(`${count('failed')} failed`);
  return parts.join(' · ');
}

/** The engine's own message from a failed request, e.g. "Unsupported Media Type", else a fallback. */
export function engineMessage(err: unknown, fallback = 'The request failed.'): string {
  if (!(err instanceof HttpError)) return err instanceof Error && err.message ? err.message : fallback;
  const body = err.message.replace(/^HTTP \d+:\s*/, '');
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === 'string' && parsed.message) return parsed.message;
  } catch {
    // Not JSON: fall through to the raw text.
  }
  return body.trim() || fallback;
}

/** The delivery's identity the idempotency key is hashed from: length-prefixed, so no two (record, version) pairs collide. */
export function deliveryIdentity(recordId: string, version: string): string {
  return `${recordId.length}:${recordId}:${version}`;
}

// ── Graph status and first-run guidance ─────────────────────────────────────

/** Human enrichment status, e.g. "Not enriched", "Enriching · 2 of 3 sources", "Enriched 12 min ago". */
export function graphStatusText(graph: ContextGraphStatus): string {
  switch (graph.state) {
    case 'building':
      return graph.progress ? `${GRAPH_STATE_LABEL.building} · ${graph.progress.done} of ${graph.progress.total} sources` : GRAPH_STATE_LABEL.building;
    case 'built':
      if (!graph.builtAt) return GRAPH_STATE_LABEL.built;
      {
        const rel = formatDistanceToNow(graph.builtAt);
        return rel ? `${GRAPH_STATE_LABEL.built} ${rel.charAt(0).toLowerCase()}${rel.slice(1)}` : GRAPH_STATE_LABEL.built;
      }
    default:
      return GRAPH_STATE_LABEL[graph.state];
  }
}

/** Not enriched is neutral: indexing already makes sources searchable, enrichment is optional. */
export function graphStatusTone(graph: ContextGraphStatus): 'success' | 'default' | 'info' | 'error' {
  switch (graph.state) {
    case 'built':
      return 'success';
    case 'building':
      return 'info';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

/**
 * Enrichment status to show: what the engine reports, unless it reports nothing
 * and we know of a job started from this browser. A job still running always wins.
 */
export function resolveGraphStatus(reported: ContextGraphStatus, job: ContextJob | undefined, starting = false): ContextGraphStatus {
  if (starting) return { state: 'building' };
  if (job && job.state !== 'succeeded' && job.state !== 'failed') return { state: 'building', jobId: job.id };
  if (reported.state !== 'not_built' || !job) return reported;
  return job.state === 'succeeded' ? { state: 'built', builtAt: job.createdAt, jobId: job.id } : { state: 'failed', jobId: job.id };
}

/**
 * The four first-run steps with their state; the first unfinished one is current.
 * Indexing happens as connectors deliver, so the first step completes from
 * source progress. Engines without progress fall back to a finished enrichment.
 */
export function getStartedSteps(engine: ContextEngineDetail, asked: boolean, progress: ContextEngineProgressSummary | null = null, uploadFirst = false): GetStartedStep[] {
  const done: Record<GetStartedStep['id'], boolean> = {
    index: progress ? progress.processed > 0 && progress.active === 0 : engine.graph.state === 'built',
    ask: asked,
    publish: engine.exposure.api || engine.exposure.mcp,
    grant: engine.queryRoles.length > 0,
  };
  const n = engine.sources.length;
  const indexing = progress ? `${progressHeadline(progress)}. ` : '';
  const defs: Omit<GetStartedStep, 'state'>[] = [
    uploadFirst && !done.index
      ? { id: 'index', title: 'Upload your first files', description: 'Files become searchable moments after they upload. Nothing else to set up.', action: 'Upload files' }
      : { id: 'index', title: 'Index your sources', description: `${indexing}Items become searchable as the connector delivers them from ${n} source${n === 1 ? '' : 's'}.` },
    { id: 'ask', title: 'Ask it something', description: 'Try the Playground and check the cited passages.' },
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
  return { name: source.name.trim(), type: source.type, audienceMapping: audienceMappingFromRules(source.audience) };
}

/** The audience mapping the engine stores: complete rules only, trimmed, later rules winning a repeated group. */
export function audienceMappingFromRules(rules: AudienceRule[] | undefined): Record<string, string> {
  const complete = (rules ?? []).filter((r) => nonEmpty(r.group) && nonEmpty(r.role));
  return Object.fromEntries(complete.map((r) => [r.group.trim(), r.role.trim()]));
}

/** A registered source as the wizard's drawer understands it: for name checks, single-instance connectors and the edit form. */
export function sourceAsConfig(source: ContextSource, rules: AudienceRule[] = []): ContextSourceConfig {
  return { type: source.type, name: source.name, values: {}, audience: rules.length ? rules : [{ group: '', role: '' }] };
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
  storage: Record<StorageKind, StoragePayload>;
}

/** Body for the engine's `PUT /spaces/{id}/configuration` — models, source settings and credentials, and where each store lives; `connections` carries details resolved from Infrastructure. */
export function toConfigurationPayload(input: CreateContextEngineInput, connections: Partial<Record<StorageKind, ResolvedConnection>> = {}): ContextEngineConfigurationPayload {
  const azure = (baseUrl: string, apiVersion: string, provider: string) => (provider === 'azure_openai' ? { baseUrl, apiVersion } : {});
  return {
    sources: input.sources.map((s) => ({ name: s.name.trim(), type: s.type, settings: sourceSettings(s), credentials: sourceSecrets(s) })),
    embedding: { provider: input.embedding.provider, model: input.embedding.model, apiKey: input.embedding.apiKey, ...azure(input.embedding.azureBaseUrl, input.embedding.azureApiVersion, input.embedding.provider) },
    llm: { provider: input.llm.provider, model: input.llm.model, apiKey: input.llm.apiKey, ...azure(input.llm.azureBaseUrl, input.llm.azureApiVersion, input.llm.provider) },
    storage: {
      vector: toStoragePayload('vector', input.storage.vector, connections.vector),
      relational: toStoragePayload('relational', input.storage.relational, connections.relational),
      graph: toStoragePayload('graph', input.storage.graph, connections.graph),
    },
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
  const body = JSON.stringify({ spaceId: engineId, question, mode: 'context', limit: 5 }, null, 2);
  return `curl -X POST ${queryEndpointUrl(baseUrl)} \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
}

/** An MCP client `mcpServers` entry pointing at this engine, ready to paste into a client config. */
/** The shape of a context-mode response, for the API tab. Mirrors the engine's `ContextQueryResponse`. */
export function buildQueryResponseExample(sourceId = 'src_…'): string {
  return JSON.stringify(
    {
      queryId: 'qry_…',
      state: 'completed',
      evidence: [
        {
          id: 'evi_…',
          recordId: 'rollback-runbook',
          sourceId,
          sourceVersion: '42',
          passage: 'To roll back a failed deployment, open the Deploy page, pick the previous release and click Promote.',
          location: 'chunk:0',
          sourceUrl: 'https://docs.example.com/runbooks/rollback',
        },
      ],
      insufficientEvidence: false,
      traceId: 'trace_…',
    },
    null,
    2,
  );
}

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
