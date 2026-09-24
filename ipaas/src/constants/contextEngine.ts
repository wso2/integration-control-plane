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

import type { ContextGraphState, ContextSourceConfig, LlmConfig, LlmProvider, McpClientId, SourceCategory, SourceConnector, SourceFieldDef, SourceFieldKind } from '../types/contextEngine';
import type { EmbeddingProvider } from '../types/ragIngestion';

const RAG_LOGO_BASE = 'assets/images/rag/';
const GENAI_LOGO_BASE = 'assets/images/genai/';

/** Resolve a public logo path against the app base URL. */
export const contextLogoUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

// ── Step 1: the connector catalog ───────────────────────────────────────────

const DB_LOGO_BASE = 'assets/images/databases/';

export const SOURCE_CATEGORIES: { id: SourceCategory; label: string }[] = [
  { id: 'documentation', label: 'Documentation' },
  { id: 'cloud-storage', label: 'Cloud storage' },
  { id: 'code', label: 'Code & tickets' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'databases', label: 'Databases' },
  { id: 'saas', label: 'SaaS apps' },
  { id: 'web-files', label: 'Web & files' },
];

/** Required field. */
const F = (key: string, label: string, kind: SourceFieldKind, extra: Partial<SourceFieldDef> = {}): SourceFieldDef => ({ key, label, kind, required: true, ...extra });
/** Optional field. */
const O = (key: string, label: string, kind: SourceFieldKind, extra: Partial<SourceFieldDef> = {}): SourceFieldDef => ({ key, label, kind, required: false, ...extra });

const MS_GRAPH_APP = [F('tenantId', 'Tenant ID', 'text'), F('clientId', 'Client ID', 'text'), F('clientSecret', 'Client Secret', 'secret')];
const SQL_TABLES = (port: string) => [
  F('host', 'Host', 'text'),
  F('port', 'Port', 'text', { defaultValue: port }),
  F('database', 'Database', 'text'),
  F('tables', 'Tables', 'text', { placeholder: 'public.docs, public.faq', helper: 'Comma-separated, schema-qualified.' }),
  F('user', 'User', 'text'),
  F('password', 'Password', 'secret'),
];

/**
 * The connectors a context engine can read from. Order within a category is
 * irrelevant; the catalog is searched, filtered and sorted by name at render time.
 */
export const SOURCE_CONNECTORS: SourceConnector[] = [
  // Documentation
  {
    id: 'confluence',
    name: 'Confluence',
    description: 'Pages in an Atlassian Confluence space.',
    category: 'documentation',
    popular: true,
    icon: 'book',
    fields: [F('baseUrl', 'Base URL', 'url', { placeholder: 'https://your-org.atlassian.net/wiki' }), F('spaceKey', 'Space Key', 'text'), F('email', 'Account Email', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['baseUrl', 'spaceKey'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages and databases shared with an integration.',
    category: 'documentation',
    icon: 'file',
    fields: [F('integrationToken', 'Integration Token', 'secret'), O('rootPageId', 'Root Page ID', 'text', { helper: 'Leave empty to read every page the integration can see.' })],
    summaryKeys: ['rootPageId'],
  },
  { id: 'gitbook', name: 'GitBook', description: 'Published docs from a space.', category: 'documentation', icon: 'book', fields: [F('spaceId', 'Space ID', 'text'), F('apiToken', 'API Token', 'secret')], summaryKeys: ['spaceId'] },
  {
    id: 'readme',
    name: 'ReadMe',
    description: 'Guides and API references in a project.',
    category: 'documentation',
    icon: 'book',
    fields: [F('projectSubdomain', 'Project Subdomain', 'text'), F('apiKey', 'API Key', 'secret')],
    summaryKeys: ['projectSubdomain'],
  },
  {
    id: 'document360',
    name: 'Document360',
    description: 'Knowledge base articles in a project version.',
    category: 'documentation',
    icon: 'book',
    fields: [F('projectVersionId', 'Project Version ID', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['projectVersionId'],
  },
  { id: 'helpjuice', name: 'Helpjuice', description: 'Knowledge base articles.', category: 'documentation', icon: 'book', fields: [F('accountUrl', 'Account URL', 'url'), F('apiKey', 'API Key', 'secret')], summaryKeys: ['accountUrl'] },

  // Cloud storage
  {
    id: 'gdrive',
    name: 'Google Drive',
    description: 'Documents in a shared folder.',
    category: 'cloud-storage',
    popular: true,
    logo: `${RAG_LOGO_BASE}googledrive.svg`,
    icon: 'folder',
    fields: [F('folderId', 'Folder ID', 'text'), F('apiKey', 'API Key', 'secret')],
    summaryKeys: ['folderId'],
  },
  {
    id: 'amazons3',
    name: 'Amazon S3',
    description: 'Objects in a bucket, optionally under a prefix.',
    category: 'cloud-storage',
    logo: `${RAG_LOGO_BASE}amazons3.svg`,
    icon: 'cloud',
    fields: [F('bucketName', 'Bucket Name', 'text'), O('prefix', 'Prefix', 'text', { placeholder: 'docs/' }), F('accessKeyId', 'Access Key ID', 'secret'), F('secretAccessKey', 'Secret Access Key', 'secret')],
    summaryKeys: ['bucketName', 'prefix'],
  },
  {
    id: 'sharepoint',
    name: 'SharePoint',
    description: 'Document libraries in a Microsoft 365 site.',
    category: 'cloud-storage',
    popular: true,
    icon: 'building',
    fields: [F('siteUrl', 'Site URL', 'url', { placeholder: 'https://contoso.sharepoint.com/sites/docs' }), ...MS_GRAPH_APP],
    summaryKeys: ['siteUrl'],
  },
  { id: 'onedrive', name: 'OneDrive', description: "Files in a user's or shared drive.", category: 'cloud-storage', icon: 'cloud', fields: [F('driveId', 'Drive ID', 'text'), ...MS_GRAPH_APP], summaryKeys: ['driveId'] },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Files in a shared folder.',
    category: 'cloud-storage',
    icon: 'box',
    fields: [F('folderPath', 'Folder Path', 'text', { placeholder: '/Team/Docs' }), F('accessToken', 'Access Token', 'secret')],
    summaryKeys: ['folderPath'],
  },
  { id: 'box', name: 'Box', description: 'Files in a folder tree.', category: 'cloud-storage', icon: 'box', fields: [F('folderId', 'Folder ID', 'text'), F('developerToken', 'Developer Token', 'secret')], summaryKeys: ['folderId'] },
  {
    id: 'azure-blob',
    name: 'Azure Blob Storage',
    description: 'Blobs in a storage container.',
    category: 'cloud-storage',
    icon: 'cloud',
    fields: [F('accountName', 'Storage Account', 'text'), F('containerName', 'Container', 'text'), F('sasToken', 'SAS Token', 'secret')],
    summaryKeys: ['accountName', 'containerName'],
  },
  {
    id: 'gcs',
    name: 'Google Cloud Storage',
    description: 'Objects in a bucket.',
    category: 'cloud-storage',
    icon: 'cloud',
    fields: [F('bucketName', 'Bucket Name', 'text'), O('prefix', 'Prefix', 'text'), F('serviceAccountJson', 'Service Account JSON', 'secret')],
    summaryKeys: ['bucketName', 'prefix'],
  },

  // Code & tickets
  {
    id: 'github',
    name: 'GitHub',
    description: 'Docs, markdown and code in a repository branch.',
    category: 'code',
    popular: true,
    icon: 'github',
    fields: [
      F('repositoryUrl', 'Repository URL', 'url', { placeholder: 'https://github.com/org/repo' }),
      F('branch', 'Branch', 'text', { defaultValue: 'main' }),
      O('includePaths', 'Include Paths', 'text', { placeholder: 'docs/**, README.md', helper: 'Optional globs, comma separated.' }),
      F('accessToken', 'Access Token', 'secret', { helper: 'A read-only token with repo scope.' }),
    ],
    summaryKeys: ['repositoryUrl', 'branch'],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'A project repository and its wiki.',
    category: 'code',
    icon: 'code',
    fields: [
      F('baseUrl', 'Base URL', 'url', { defaultValue: 'https://gitlab.com' }),
      F('projectPath', 'Project Path', 'text', { placeholder: 'group/project' }),
      F('branch', 'Branch', 'text', { defaultValue: 'main' }),
      F('accessToken', 'Access Token', 'secret'),
    ],
    summaryKeys: ['projectPath', 'branch'],
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    description: 'Repositories in a workspace.',
    category: 'code',
    icon: 'code',
    fields: [F('workspace', 'Workspace', 'text'), F('repositorySlug', 'Repository Slug', 'text'), F('branch', 'Branch', 'text', { defaultValue: 'main' }), F('appPassword', 'App Password', 'secret')],
    summaryKeys: ['workspace', 'repositorySlug'],
  },
  {
    id: 'azure-devops',
    name: 'Azure DevOps',
    description: 'Repositories and wiki pages in a project.',
    category: 'code',
    icon: 'code',
    fields: [F('organizationUrl', 'Organization URL', 'url', { placeholder: 'https://dev.azure.com/org' }), F('project', 'Project', 'text'), F('personalAccessToken', 'Personal Access Token', 'secret')],
    summaryKeys: ['organizationUrl', 'project'],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Issues in a project.',
    category: 'code',
    icon: 'kanban',
    fields: [F('baseUrl', 'Base URL', 'url', { placeholder: 'https://your-org.atlassian.net' }), F('projectKey', 'Project Key', 'text'), F('email', 'Account Email', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['baseUrl', 'projectKey'],
  },
  { id: 'linear', name: 'Linear', description: 'Issues and project documents.', category: 'code', icon: 'kanban', fields: [F('teamKey', 'Team Key', 'text'), F('apiKey', 'API Key', 'secret')], summaryKeys: ['teamKey'] },
  { id: 'asana', name: 'Asana', description: 'Tasks and project descriptions.', category: 'code', icon: 'kanban', fields: [F('projectId', 'Project ID', 'text'), F('accessToken', 'Access Token', 'secret')], summaryKeys: ['projectId'] },
  { id: 'trello', name: 'Trello', description: 'Cards in a board.', category: 'code', icon: 'kanban', fields: [F('boardId', 'Board ID', 'text'), F('apiKey', 'API Key', 'secret'), F('apiToken', 'API Token', 'secret')], summaryKeys: ['boardId'] },

  // Collaboration
  {
    id: 'slack',
    name: 'Slack',
    description: 'Messages and files in selected channels.',
    category: 'collaboration',
    icon: 'hash',
    fields: [F('channels', 'Channels', 'text', { placeholder: '#support, #platform' }), F('botToken', 'Bot Token', 'secret')],
    summaryKeys: ['channels'],
  },
  { id: 'teams', name: 'Microsoft Teams', description: 'Channel conversations in a team.', category: 'collaboration', icon: 'chat', fields: [F('teamId', 'Team ID', 'text'), ...MS_GRAPH_APP], summaryKeys: ['teamId'] },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Labelled mail threads from a mailbox.',
    category: 'collaboration',
    icon: 'mail',
    fields: [F('label', 'Label', 'text', { placeholder: 'support' }), F('clientId', 'Client ID', 'text'), F('clientSecret', 'Client Secret', 'secret'), F('refreshToken', 'Refresh Token', 'secret')],
    summaryKeys: ['label'],
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Mail folders from a Microsoft 365 mailbox.',
    category: 'collaboration',
    icon: 'mail',
    fields: [F('mailbox', 'Mailbox', 'text', { placeholder: 'support@example.com' }), ...MS_GRAPH_APP],
    summaryKeys: ['mailbox'],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Meeting transcripts and recordings.',
    category: 'collaboration',
    icon: 'video',
    fields: [F('accountId', 'Account ID', 'text'), F('clientId', 'Client ID', 'text'), F('clientSecret', 'Client Secret', 'secret')],
    summaryKeys: ['accountId'],
  },
  { id: 'google-chat', name: 'Google Chat', description: 'Conversations in a space.', category: 'collaboration', icon: 'chat', fields: [F('spaceId', 'Space ID', 'text'), F('serviceAccountJson', 'Service Account JSON', 'secret')], summaryKeys: ['spaceId'] },

  // Databases
  { id: 'postgresql', name: 'PostgreSQL', description: 'Rows from selected tables.', category: 'databases', logo: `${DB_LOGO_BASE}postgresql.svg`, icon: 'database', fields: SQL_TABLES('5432'), summaryKeys: ['host', 'database'] },
  { id: 'mysql', name: 'MySQL', description: 'Rows from selected tables.', category: 'databases', logo: `${DB_LOGO_BASE}mysql.svg`, icon: 'database', fields: SQL_TABLES('3306'), summaryKeys: ['host', 'database'] },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Documents in a collection.',
    category: 'databases',
    icon: 'database',
    fields: [F('connectionString', 'Connection String', 'secret'), F('database', 'Database', 'text'), F('collection', 'Collection', 'text')],
    summaryKeys: ['database', 'collection'],
  },
  {
    id: 'snowflake',
    name: 'Snowflake',
    description: 'Rows from a table or view.',
    category: 'databases',
    icon: 'database',
    fields: [F('account', 'Account', 'text'), F('warehouse', 'Warehouse', 'text'), F('database', 'Database', 'text'), F('schema', 'Schema', 'text'), F('table', 'Table', 'text'), F('user', 'User', 'text'), F('password', 'Password', 'secret')],
    summaryKeys: ['database', 'table'],
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    description: 'Rows from a table.',
    category: 'databases',
    icon: 'table',
    fields: [F('projectId', 'Project ID', 'text'), F('dataset', 'Dataset', 'text'), F('table', 'Table', 'text'), F('serviceAccountJson', 'Service Account JSON', 'secret')],
    summaryKeys: ['dataset', 'table'],
  },
  { id: 'redshift', name: 'Amazon Redshift', description: 'Rows from selected tables.', category: 'databases', icon: 'database', fields: SQL_TABLES('5439'), summaryKeys: ['host', 'database'] },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    description: 'Documents from an index.',
    category: 'databases',
    icon: 'database',
    fields: [F('endpoint', 'Endpoint', 'url'), F('indexName', 'Index', 'text'), F('apiKey', 'API Key', 'secret')],
    summaryKeys: ['endpoint', 'indexName'],
  },

  // SaaS apps
  {
    id: 'zendesk',
    name: 'Zendesk',
    description: 'Tickets and help-center articles.',
    category: 'saas',
    icon: 'headset',
    fields: [F('subdomain', 'Subdomain', 'text', { placeholder: 'your-org' }), F('email', 'Account Email', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['subdomain'],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Knowledge articles and case notes.',
    category: 'saas',
    icon: 'cloud',
    fields: [F('instanceUrl', 'Instance URL', 'url'), F('clientId', 'Consumer Key', 'text'), F('clientSecret', 'Consumer Secret', 'secret'), F('refreshToken', 'Refresh Token', 'secret')],
    summaryKeys: ['instanceUrl'],
  },
  { id: 'hubspot', name: 'HubSpot', description: 'Knowledge base articles and notes.', category: 'saas', icon: 'chat', fields: [F('privateAppToken', 'Private App Token', 'secret')], summaryKeys: [] },
  { id: 'intercom', name: 'Intercom', description: 'Help center articles and conversations.', category: 'saas', icon: 'headset', fields: [F('accessToken', 'Access Token', 'secret')], summaryKeys: [] },
  {
    id: 'servicenow',
    name: 'ServiceNow',
    description: 'Knowledge articles and incidents.',
    category: 'saas',
    icon: 'shield',
    fields: [F('instanceUrl', 'Instance URL', 'url'), F('username', 'Username', 'text'), F('password', 'Password', 'secret')],
    summaryKeys: ['instanceUrl'],
  },
  {
    id: 'freshdesk',
    name: 'Freshdesk',
    description: 'Tickets and solution articles.',
    category: 'saas',
    icon: 'headset',
    fields: [F('domain', 'Domain', 'text', { placeholder: 'your-org.freshdesk.com' }), F('apiKey', 'API Key', 'secret')],
    summaryKeys: ['domain'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Products, policies and help pages.',
    category: 'saas',
    icon: 'cart',
    fields: [F('storeDomain', 'Store Domain', 'text', { placeholder: 'your-store.myshopify.com' }), F('adminAccessToken', 'Admin Access Token', 'secret')],
    summaryKeys: ['storeDomain'],
  },
  { id: 'stripe', name: 'Stripe', description: 'Products and their descriptions.', category: 'saas', icon: 'card', fields: [F('secretKey', 'Secret Key', 'secret')], summaryKeys: [] },

  // Web & files
  {
    id: 'website',
    name: 'Website',
    description: 'Public pages crawled from a list of URLs.',
    category: 'web-files',
    icon: 'globe',
    fields: [
      F('urls', 'Page URLs', 'urls', { placeholder: 'https://docs.example.com/getting-started\nhttps://docs.example.com/faq', helper: 'One URL per line.' }),
      O('maxDepth', 'Link Depth', 'text', { defaultValue: '1', helper: 'How many link hops to follow from each URL.' }),
    ],
    summaryKeys: ['urls'],
  },
  { id: 'sitemap', name: 'Sitemap', description: 'Every page listed in a sitemap.xml.', category: 'web-files', icon: 'globe', fields: [F('sitemapUrl', 'Sitemap URL', 'url', { placeholder: 'https://example.com/sitemap.xml' })], summaryKeys: ['sitemapUrl'] },
  { id: 'rss', name: 'RSS Feed', description: 'Articles from a feed.', category: 'web-files', icon: 'rss', fields: [F('feedUrl', 'Feed URL', 'url')], summaryKeys: ['feedUrl'] },
  { id: 'upload', name: 'File Upload', description: 'Files you upload to the engine directly.', category: 'web-files', popular: true, icon: 'upload', fields: [], summaryKeys: [], single: true },
];

export const CONNECTOR_BY_ID: Record<string, SourceConnector> = Object.fromEntries(SOURCE_CONNECTORS.map((c) => [c.id, c]));

export const POPULAR_CONNECTORS: SourceConnector[] = SOURCE_CONNECTORS.filter((c) => c.popular);

/** Connectors rendered per catalog page; the next page loads as the list scrolls into view. */
export const CATALOG_PAGE_SIZE = 24;

/** Blank config for a connector; `name` defaults to the connector's display name and fields to their defaults. */
export function blankSource(connectorId: string): ContextSourceConfig {
  const connector = CONNECTOR_BY_ID[connectorId];
  if (!connector) throw new Error(`Unknown source connector: ${connectorId}`);
  return { type: connector.id, name: connector.name, values: Object.fromEntries(connector.fields.map((f) => [f.key, f.defaultValue ?? ''])) };
}

// ── Step 3: LLM providers (embedding providers are shared with RAG) ─────────

export interface LlmProviderInfo {
  id: LlmProvider;
  name: string;
  /** Logo path under the public folder, resolved with {@link contextLogoUrl}. */
  logo: string;
  /** Selectable model ids. Empty means the provider takes a free-text deployment id (Azure). */
  models: string[];
}

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  { id: 'openai', name: 'Open AI', logo: `${GENAI_LOGO_BASE}openai.svg`, models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'] },
  { id: 'anthropic', name: 'Anthropic AI', logo: `${GENAI_LOGO_BASE}anthropic.svg`, models: ['claude-sonnet-4-6', 'claude-haiku-4-5'] },
  { id: 'azure_openai', name: 'Azure Open AI', logo: `${GENAI_LOGO_BASE}azure-openai.svg`, models: [] },
  { id: 'mistral', name: 'Mistral AI', logo: `${GENAI_LOGO_BASE}mistral.svg`, models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'] },
];

export const LLM_AZURE_DEFAULT_API_VERSION = '2024-06-01';

export function blankLlm(provider: LlmProvider): LlmConfig {
  return { provider, model: '', apiKey: '', azureBaseUrl: '', azureApiVersion: provider === 'azure_openai' ? LLM_AZURE_DEFAULT_API_VERSION : '' };
}

// ── Engine limits and access model ──────────────────────────────────────────

/** Mirrors the engine's `CreateContextSpace` schema limits. */
export const CONTEXT_ENGINE_NAME_MAX = 120;
export const CONTEXT_ENGINE_DESCRIPTION_MAX = 1000;

/** Engine actions a querying role receives — read context, open evidence, see the trace. */
export const CONTEXT_QUERY_ACTIONS = ['context.read', 'evidence.read', 'trace.read'] as const;

/** Grants created for an org role are keyed `role-<handle>` so they can be told apart from ad-hoc grants. */
export const ROLE_GRANT_PREFIX = 'role-';

export const CONTEXT_QUERY_DEFAULT_LIMIT = 10;
export const CONTEXT_QUERY_MAX_LENGTH = 10000;

/** Jobs stop being polled once they reach one of these. */
export const CONTEXT_JOB_TERMINAL_STATES = new Set(['succeeded', 'failed']);

// ── Exposure ────────────────────────────────────────────────────────────────

export interface ContextMcpToolInfo {
  name: string;
  description: string;
}

/** Read tools the engine's MCP facade publishes (from its MCP contract). */
export const CONTEXT_MCP_TOOLS: ContextMcpToolInfo[] = [
  { name: 'list_context_spaces', description: 'List context engines visible to the caller.' },
  { name: 'query_context', description: 'Ask a natural-language question against this engine.' },
  { name: 'get_evidence', description: 'Read one authorized evidence item behind an answer.' },
  { name: 'explain_query', description: 'Return a caller-safe explanation of how evidence was selected.' },
];

// ── Recommended models ──────────────────────────────────────────────────────

/** One-click default pair: one provider, one key, good quality at low cost. */
export const RECOMMENDED_MODELS: { embedding: { provider: EmbeddingProvider; model: string }; llm: { provider: LlmProvider; model: string } } = {
  embedding: { provider: 'openai', model: 'text-embedding-3-small' },
  llm: { provider: 'openai', model: 'gpt-4.1' },
};

// ── Graph status ────────────────────────────────────────────────────────────

export const GRAPH_STATE_LABEL: Record<ContextGraphState, string> = {
  not_built: 'Not built',
  building: 'Building',
  built: 'Built',
  failed: 'Build failed',
};

// ── MCP clients ─────────────────────────────────────────────────────────────

export const MCP_CLIENTS: { id: McpClientId; label: string; path: string }[] = [
  { id: 'claude-desktop', label: 'Claude Desktop', path: '~/Library/Application Support/Claude/claude_desktop_config.json' },
  { id: 'cursor', label: 'Cursor', path: '.cursor/mcp.json' },
  { id: 'vscode', label: 'VS Code', path: '.vscode/mcp.json' },
  { id: 'generic', label: 'Generic', path: 'Any client that reads an mcpServers map' },
];

// ── Local persistence keys ──────────────────────────────────────────────────

/** Session-storage key prefix for the create-wizard draft, suffixed by org handle. */
export const CONTEXT_ENGINE_DRAFT_KEY_PREFIX = 'contextEngine:draft:';
/** Local-storage key prefix marking that the user has asked an engine something, suffixed by engine id. */
export const CONTEXT_ENGINE_ASKED_KEY_PREFIX = 'contextEngine:asked:';

/** Suggested questions offered in an empty Playground; `{source}` is replaced by a source name. */
export const PLAYGROUND_SUGGESTIONS = ['Summarize what is in {source}', 'What should a new team member read first?', 'Which documents mention rate limits or quotas?'];
