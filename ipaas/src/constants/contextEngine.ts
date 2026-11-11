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

import type {
  ContextEngineStorage,
  ContextQueryMode,
  ContextSourceConfig,
  FileVisibility,
  LlmConfig,
  LlmProvider,
  McpClientId,
  SourceCategory,
  SourceConnector,
  SourceFieldDef,
  SourceFieldKind,
  SourceProgressStatus,
  StorageKind,
  UploadFileStatus,
} from '../types/contextEngine';
import type { EmbeddingProviderInfo } from './ragIngestion';

const GENAI_LOGO_BASE = 'assets/images/genai/';

/** Resolve a public logo path against the app base URL. */
export const contextLogoUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

// ── Step 1: the connector catalog ───────────────────────────────────────────

const CONNECTOR_LOGO_BASE = 'assets/images/connectors/';

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
/** Put a run of fields under one collapsible section heading; spread the result into a connector's `fields`. Pass `{ label, collapsed }` to start the section collapsed. */
const G = (group: string | { label: string; collapsed?: boolean }, ...fields: SourceFieldDef[]): SourceFieldDef[] => {
  const label = typeof group === 'string' ? group : group.label;
  const collapsed = typeof group === 'string' ? false : !!group.collapsed;
  return fields.map((f) => ({ ...f, group: label, ...(collapsed ? { groupCollapsed: true } : {}) }));
};

const MS_GRAPH_APP = [F('tenantId', 'Tenant ID', 'text'), F('clientId', 'Client ID', 'text'), F('clientSecret', 'Client Secret', 'secret')];

/** Show a field only for the chosen auth flow (matches a connector's `authType` discriminator). */
const authIs = (...flows: string[]): SourceFieldDef['showWhen'] => ({ field: 'authType', equals: flows });

/** Connection fields shared by the Google connectors, mirroring the Ballerina `google_auth` module's GoogleAuth: one of three OAuth2 flows, chosen by authType. */

/**
 * Optional RML mapping section, appended to connectors whose `isStructuredData` is
 * set. A provided .rml.ttl is used to generate the context graph from the source's
 * records; left empty, the engine generates the graph with the LLM. Its own collapsible section.
 */
export const RML_MAPPING = G(
  { label: 'RML Mapping', collapsed: true },
  O('rmlMapping', 'Mapping file', 'file', {
    accept: '.rml.ttl,.ttl',
    helper: 'Optional. Leave empty to let AI build the graph.',
  }),
);

/**
 * Sign-in fields of the Google integrations, nested under their `auth` setting. Service accounts
 * are not offered: the integrations read their key from a file that nothing mounts.
 */
const GOOGLE_AUTH = [
  F('authType', 'Authentication', 'select', {
    defaultValue: 'refresh_token',
    options: [
      { value: 'refresh_token', label: 'Refresh token' },
      { value: 'bearer', label: 'Access token' },
    ],
    setting: 'auth.type',
  }),
  F('clientId', 'Client ID', 'text', { showWhen: authIs('refresh_token'), setting: 'auth.clientId' }),
  F('clientSecret', 'Client Secret', 'secret', { showWhen: authIs('refresh_token'), setting: 'auth.clientSecret' }),
  F('refreshToken', 'Refresh Token', 'secret', { showWhen: authIs('refresh_token'), setting: 'auth.refreshToken' }),
  F('token', 'Access Token', 'secret', { showWhen: authIs('bearer'), helper: 'Not refreshed. Sync stops when it expires.', setting: 'auth.token' }),
];

const SQL_TABLES = (port: string) => [
  F('host', 'Host', 'text'),
  F('port', 'Port', 'text', { defaultValue: port }),
  F('database', 'Database', 'text'),
  F('tables', 'Tables', 'text', { placeholder: 'public.docs, public.faq', helper: 'Comma-separated, schema-qualified.' }),
  F('user', 'User', 'text'),
  F('password', 'Password', 'secret', { verbatim: true }),
];

/**
 * Grouped form fields for a SQL database connector, mirroring the database integrations'
 * settings: the table, the columns to ingest and the poll for rows that Change Data Capture
 * missed. `schemaDefault` adds a Schema field (PostgreSQL, SQL Server);
 * MySQL has no schema layer and omits it.
 */
const DATABASE_FIELDS = (port: string, schemaDefault?: string): SourceFieldDef[] => [
  ...G(
    'Connection',
    F('host', 'Host', 'text', { defaultValue: 'localhost' }),
    F('port', 'Port', 'text', { defaultValue: port, valueType: 'integer' }),
    F('database', 'Database', 'text', { setting: 'databaseName' }),
    ...(schemaDefault !== undefined ? [O('schema', 'Schema', 'text', { defaultValue: schemaDefault })] : []),
    F('username', 'Username', 'text'),
    F('password', 'Password', 'secret', { verbatim: true }),
  ),
  ...G(
    'Data to sync',
    F('tableName', 'Table', 'text'),
    F('primaryKey', 'Primary Key', 'text'),
    O('columns', 'Columns', 'text', { placeholder: 'id, title, body', helper: 'Comma-separated. Leave empty for all columns.', valueType: 'list' }),
    O('updatedAtColumn', 'Updated-at Column', 'text', { helper: 'Last-updated time. Recommended.' }),
  ),
  ...G(
    { label: 'Sync options', collapsed: true },
    O('pollInterval', 'Poll Interval', 'text', { placeholder: '300', helper: 'Seconds between polls for new rows the change listener missed.', valueType: 'number' }),
  ),
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
    logo: `${CONNECTOR_LOGO_BASE}confluence.svg`,
    icon: 'book',
    fields: [F('baseUrl', 'Base URL', 'url', { placeholder: 'https://your-org.atlassian.net/wiki' }), F('spaceKey', 'Space Key', 'text'), F('email', 'Account Email', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['baseUrl', 'spaceKey'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages and databases shared with an integration.',
    category: 'documentation',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}notion.svg`,
    icon: 'file',
    fields: [F('integrationToken', 'Integration Token', 'secret'), O('rootPageId', 'Root Page ID', 'text', { helper: 'Leave empty to read every page the integration can see.' })],
    summaryKeys: ['rootPageId'],
  },
  {
    id: 'gitbook',
    name: 'GitBook',
    description: 'Published docs from a space.',
    category: 'documentation',
    logo: `${CONNECTOR_LOGO_BASE}gitbook.svg`,
    icon: 'book',
    fields: [F('spaceId', 'Space ID', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['spaceId'],
  },
  {
    id: 'readme',
    name: 'ReadMe',
    description: 'Guides and API references in a project.',
    category: 'documentation',
    logo: `${CONNECTOR_LOGO_BASE}readme.svg`,
    icon: 'book',
    fields: [F('projectSubdomain', 'Project Subdomain', 'text'), F('apiKey', 'API Key', 'secret')],
    summaryKeys: ['projectSubdomain'],
  },
  {
    id: 'document360',
    name: 'Document360',
    description: 'Knowledge base articles in a project version.',
    category: 'documentation',
    logo: `${CONNECTOR_LOGO_BASE}document360.svg`,
    icon: 'book',
    fields: [F('projectVersionId', 'Project Version ID', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['projectVersionId'],
  },
  {
    id: 'helpjuice',
    name: 'Helpjuice',
    description: 'Knowledge base articles.',
    category: 'documentation',
    logo: `${CONNECTOR_LOGO_BASE}helpjuice.svg`,
    icon: 'book',
    fields: [F('accountUrl', 'Account URL', 'url'), F('apiKey', 'API Key', 'secret')],
    summaryKeys: ['accountUrl'],
  },

  // Cloud storage
  {
    id: 'gdrive',
    name: 'Google Drive',
    description: 'Files in a Drive folder and its subfolders.',
    category: 'cloud-storage',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}gdrive.svg`,
    icon: 'folder',
    // Mirrors the Ballerina `google_drive` connector's GoogleDriveSettings: an auth block
    // (one of three OAuth2 flows, chosen by authType) plus the folder and sync options.
    fields: [...G('Connection', ...GOOGLE_AUTH), ...G('Data to sync', F('folderId', 'Folder ID', 'text', { helper: 'Subfolders are included.' }))],
    summaryKeys: ['folderId'],
  },
  {
    id: 'amazons3',
    name: 'Amazon S3',
    description: 'Objects in a bucket, optionally under a prefix.',
    category: 'cloud-storage',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}amazons3.svg`,
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
    logo: `${CONNECTOR_LOGO_BASE}sharepoint.svg`,
    icon: 'building',
    fields: [F('siteUrl', 'Site URL', 'url', { placeholder: 'https://contoso.sharepoint.com/sites/docs' }), ...MS_GRAPH_APP],
    summaryKeys: ['siteUrl'],
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: "Files in a user's or shared drive.",
    category: 'cloud-storage',
    logo: `${CONNECTOR_LOGO_BASE}onedrive.svg`,
    icon: 'cloud',
    fields: [F('driveId', 'Drive ID', 'text'), ...MS_GRAPH_APP],
    summaryKeys: ['driveId'],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Files in a shared folder.',
    category: 'cloud-storage',
    logo: `${CONNECTOR_LOGO_BASE}dropbox.svg`,
    icon: 'box',
    fields: [F('folderPath', 'Folder Path', 'text', { placeholder: '/Team/Docs' }), F('accessToken', 'Access Token', 'secret')],
    summaryKeys: ['folderPath'],
  },
  {
    id: 'box',
    name: 'Box',
    description: 'Files in a folder tree.',
    category: 'cloud-storage',
    logo: `${CONNECTOR_LOGO_BASE}box.svg`,
    icon: 'box',
    fields: [F('folderId', 'Folder ID', 'text'), F('developerToken', 'Developer Token', 'secret')],
    summaryKeys: ['folderId'],
  },
  {
    id: 'azure-blob',
    name: 'Azure Blob Storage',
    description: 'Blobs in a storage container.',
    category: 'cloud-storage',
    logo: `${CONNECTOR_LOGO_BASE}azure-blob.svg`,
    icon: 'cloud',
    fields: [F('accountName', 'Storage Account', 'text'), F('containerName', 'Container', 'text'), F('sasToken', 'SAS Token', 'secret')],
    summaryKeys: ['accountName', 'containerName'],
  },
  {
    id: 'gcs',
    name: 'Google Cloud Storage',
    description: 'Objects in a bucket.',
    category: 'cloud-storage',
    logo: `${CONNECTOR_LOGO_BASE}gcs.svg`,
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
    logo: `${CONNECTOR_LOGO_BASE}github.svg`,
    logoDark: `${CONNECTOR_LOGO_BASE}github-dark.svg`,
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
    logo: `${CONNECTOR_LOGO_BASE}gitlab.svg`,
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
    logo: `${CONNECTOR_LOGO_BASE}bitbucket.svg`,
    icon: 'code',
    fields: [F('workspace', 'Workspace', 'text'), F('repositorySlug', 'Repository Slug', 'text'), F('branch', 'Branch', 'text', { defaultValue: 'main' }), F('appPassword', 'App Password', 'secret')],
    summaryKeys: ['workspace', 'repositorySlug'],
  },
  {
    id: 'azure-devops',
    name: 'Azure DevOps',
    description: 'Repositories and wiki pages in a project.',
    category: 'code',
    logo: `${CONNECTOR_LOGO_BASE}azure-devops.svg`,
    icon: 'code',
    fields: [F('organizationUrl', 'Organization URL', 'url', { placeholder: 'https://dev.azure.com/org' }), F('project', 'Project', 'text'), F('personalAccessToken', 'Personal Access Token', 'secret')],
    summaryKeys: ['organizationUrl', 'project'],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Issues in a project.',
    category: 'code',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}jira.svg`,
    icon: 'kanban',
    fields: [F('baseUrl', 'Base URL', 'url', { placeholder: 'https://your-org.atlassian.net' }), F('projectKey', 'Project Key', 'text'), F('email', 'Account Email', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['baseUrl', 'projectKey'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issues and project documents.',
    category: 'code',
    logo: `${CONNECTOR_LOGO_BASE}linear.svg`,
    icon: 'kanban',
    fields: [F('teamKey', 'Team Key', 'text'), F('apiKey', 'API Key', 'secret')],
    summaryKeys: ['teamKey'],
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Tasks and project descriptions.',
    category: 'code',
    logo: `${CONNECTOR_LOGO_BASE}asana.svg`,
    icon: 'kanban',
    fields: [F('projectId', 'Project ID', 'text'), F('accessToken', 'Access Token', 'secret')],
    summaryKeys: ['projectId'],
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Cards in a board.',
    category: 'code',
    logo: `${CONNECTOR_LOGO_BASE}trello.svg`,
    icon: 'kanban',
    fields: [F('boardId', 'Board ID', 'text'), F('apiKey', 'API Key', 'secret'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['boardId'],
  },

  // Collaboration
  {
    id: 'slack',
    name: 'Slack',
    description: 'Messages and files in selected channels.',
    category: 'collaboration',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}slack.svg`,
    icon: 'hash',
    fields: [F('channels', 'Channels', 'text', { placeholder: '#support, #platform' }), F('botToken', 'Bot Token', 'secret')],
    summaryKeys: ['channels'],
  },
  { id: 'teams', name: 'Microsoft Teams', description: 'Channel conversations in a team.', category: 'collaboration', logo: `${CONNECTOR_LOGO_BASE}teams.svg`, icon: 'chat', fields: [F('teamId', 'Team ID', 'text'), ...MS_GRAPH_APP], summaryKeys: ['teamId'] },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Labelled mail threads from a mailbox.',
    category: 'collaboration',
    logo: `${CONNECTOR_LOGO_BASE}gmail.svg`,
    icon: 'mail',
    fields: [F('label', 'Label', 'text', { placeholder: 'support' }), F('clientId', 'Client ID', 'text'), F('clientSecret', 'Client Secret', 'secret'), F('refreshToken', 'Refresh Token', 'secret')],
    summaryKeys: ['label'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Events from one calendar, kept in sync.',
    category: 'collaboration',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}google-calendar.svg`,
    icon: 'calendar',
    // Mirrors the Ballerina `google_calendar` connector's GoogleCalendarSettings: the shared Google
    // auth block plus the calendar, the events to deliver and the page size.
    fields: [
      ...G('Connection', ...GOOGLE_AUTH),
      ...G(
        'Data to sync',
        F('calendarId', 'Calendar ID', 'text', { defaultValue: 'primary', helper: '"primary" for the connected account’s calendar, or another calendar’s ID.' }),
        F('eventTypes', 'Event Types', 'text', { defaultValue: 'default, outOfOffice', helper: 'Comma-separated. Any of: default, outOfOffice, focusTime, workingLocation, birthday, fromGmail.', valueType: 'list' }),
        F('includePrivateEvents', 'Private Events', 'select', {
          defaultValue: 'false',
          options: [
            { value: 'false', label: 'Exclude' },
            { value: 'true', label: 'Include' },
          ],
          helper: 'When excluded, an event made private later is removed.',
          valueType: 'boolean',
        }),
      ),
      ...G({ label: 'Sync options', collapsed: true }, O('pageSize', 'Page Size', 'text', { defaultValue: '250', helper: 'Events fetched per poll, from 1 to 2500.', valueType: 'integer' })),
    ],
    summaryKeys: ['calendarId'],
    isStructuredData: true,
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Mail folders from a Microsoft 365 mailbox.',
    category: 'collaboration',
    logo: `${CONNECTOR_LOGO_BASE}outlook.svg`,
    icon: 'mail',
    fields: [F('mailbox', 'Mailbox', 'text', { placeholder: 'support@example.com' }), ...MS_GRAPH_APP],
    summaryKeys: ['mailbox'],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Meeting transcripts and recordings.',
    category: 'collaboration',
    logo: `${CONNECTOR_LOGO_BASE}zoom.svg`,
    icon: 'video',
    fields: [F('accountId', 'Account ID', 'text'), F('clientId', 'Client ID', 'text'), F('clientSecret', 'Client Secret', 'secret')],
    summaryKeys: ['accountId'],
  },
  {
    id: 'google-chat',
    name: 'Google Chat',
    description: 'Conversations in a space.',
    category: 'collaboration',
    logo: `${CONNECTOR_LOGO_BASE}google-chat.svg`,
    icon: 'chat',
    fields: [F('spaceId', 'Space ID', 'text'), F('serviceAccountJson', 'Service Account JSON', 'secret')],
    summaryKeys: ['spaceId'],
  },

  // Databases
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Rows of a table, kept in sync.',
    category: 'databases',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}postgresql.svg`,
    icon: 'database',
    fields: [
      ...DATABASE_FIELDS('5432', 'public'),
      ...G(
        { label: 'Sync options', collapsed: true },
        O('slotName', 'Replication Slot', 'text', { helper: 'Leave empty for the default.' }),
        O('publicationName', 'Publication', 'text', { helper: 'Leave empty for the default.' }),
      ),
    ],
    summaryKeys: ['host', 'database'],
    isStructuredData: true,
  },
  {
    id: 'mysql',
    name: 'MySQL',
    description: 'Rows of a table, kept in sync.',
    category: 'databases',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}mysql.svg`,
    logoDark: `${CONNECTOR_LOGO_BASE}mysql-dark.svg`,
    icon: 'database',
    fields: DATABASE_FIELDS('3306'),
    summaryKeys: ['host', 'database'],
    isStructuredData: true,
  },
  {
    id: 'mssql',
    name: 'Microsoft SQL Server',
    description: 'Rows of a table, kept in sync.',
    category: 'databases',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}mssql.svg`,
    icon: 'database',
    fields: DATABASE_FIELDS('1433', 'dbo'),
    summaryKeys: ['host', 'database'],
    isStructuredData: true,
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    description: 'Documents in a collection.',
    category: 'databases',
    logo: `${CONNECTOR_LOGO_BASE}mongodb.svg`,
    icon: 'database',
    fields: [F('connectionString', 'Connection String', 'secret'), F('database', 'Database', 'text'), F('collection', 'Collection', 'text')],
    summaryKeys: ['database', 'collection'],
  },
  {
    id: 'snowflake',
    name: 'Snowflake',
    description: 'Rows from a table or view.',
    category: 'databases',
    logo: `${CONNECTOR_LOGO_BASE}snowflake.svg`,
    icon: 'database',
    fields: [F('account', 'Account', 'text'), F('warehouse', 'Warehouse', 'text'), F('database', 'Database', 'text'), F('schema', 'Schema', 'text'), F('table', 'Table', 'text'), F('user', 'User', 'text'), F('password', 'Password', 'secret', { verbatim: true })],
    summaryKeys: ['database', 'table'],
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    description: 'Rows from a table.',
    category: 'databases',
    logo: `${CONNECTOR_LOGO_BASE}bigquery.svg`,
    icon: 'table',
    fields: [F('projectId', 'Project ID', 'text'), F('dataset', 'Dataset', 'text'), F('table', 'Table', 'text'), F('serviceAccountJson', 'Service Account JSON', 'secret')],
    summaryKeys: ['dataset', 'table'],
  },
  { id: 'redshift', name: 'Amazon Redshift', description: 'Rows from selected tables.', category: 'databases', logo: `${CONNECTOR_LOGO_BASE}redshift.svg`, icon: 'database', fields: SQL_TABLES('5439'), summaryKeys: ['host', 'database'] },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    description: 'Documents from an index.',
    category: 'databases',
    logo: `${CONNECTOR_LOGO_BASE}elasticsearch.svg`,
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
    logo: `${CONNECTOR_LOGO_BASE}zendesk.svg`,
    logoDark: `${CONNECTOR_LOGO_BASE}zendesk-dark.svg`,
    icon: 'headset',
    fields: [F('subdomain', 'Subdomain', 'text', { placeholder: 'your-org' }), F('email', 'Account Email', 'text'), F('apiToken', 'API Token', 'secret')],
    summaryKeys: ['subdomain'],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Records of a Salesforce object, kept in sync.',
    category: 'saas',
    popular: true,
    logo: `${CONNECTOR_LOGO_BASE}salesforce.svg`,
    icon: 'cloud',
    fields: [
      ...G(
        'Connection',
        F('baseUrl', 'Instance URL', 'url', { placeholder: 'https://your-domain.my.salesforce.com', helper: 'Your My Domain URL.' }),
        F('authType', 'Authentication', 'select', {
          defaultValue: 'client_credentials',
          options: [
            { value: 'client_credentials', label: 'Client credentials' },
            { value: 'refresh_token', label: 'Refresh token' },
            { value: 'bearer', label: 'Access token' },
          ],
          setting: 'auth.type',
        }),
        F('clientId', 'Consumer Key', 'text', { showWhen: authIs('client_credentials', 'refresh_token'), setting: 'auth.clientId' }),
        F('clientSecret', 'Consumer Secret', 'secret', { showWhen: authIs('client_credentials', 'refresh_token'), setting: 'auth.clientSecret' }),
        F('refreshToken', 'Refresh Token', 'secret', { showWhen: authIs('refresh_token'), setting: 'auth.refreshToken' }),
        F('token', 'Access Token', 'secret', { showWhen: authIs('bearer'), helper: 'Not refreshed. Sync stops when it expires.', setting: 'auth.token' }),
      ),
      ...G('Data to sync', F('sobject', 'Object', 'text', { placeholder: 'Account', helper: 'Must have Change Data Capture enabled.' }), F('fields', 'Fields', 'text', { placeholder: 'Name, Industry, Description', helper: 'Comma-separated.', valueType: 'list' })),
      ...G(
        { label: 'Sync options', collapsed: true },
        O('apiVersion', 'API Version', 'text', { defaultValue: '59.0' }),
        O('pollInterval', 'Poll Interval', 'text', { placeholder: '300', helper: 'Seconds between polls for records the change listener missed.', valueType: 'number' }),
      ),
    ],
    summaryKeys: ['baseUrl', 'sobject'],
    isStructuredData: true,
  },
  { id: 'hubspot', name: 'HubSpot', description: 'Knowledge base articles and notes.', category: 'saas', logo: `${CONNECTOR_LOGO_BASE}hubspot.svg`, icon: 'chat', fields: [F('privateAppToken', 'Private App Token', 'secret')], summaryKeys: [] },
  { id: 'intercom', name: 'Intercom', description: 'Help center articles and conversations.', category: 'saas', logo: `${CONNECTOR_LOGO_BASE}intercom.svg`, icon: 'headset', fields: [F('accessToken', 'Access Token', 'secret')], summaryKeys: [] },
  {
    id: 'servicenow',
    name: 'ServiceNow',
    description: 'Knowledge articles and incidents.',
    category: 'saas',
    logo: `${CONNECTOR_LOGO_BASE}servicenow.svg`,
    icon: 'shield',
    fields: [F('instanceUrl', 'Instance URL', 'url'), F('username', 'Username', 'text'), F('password', 'Password', 'secret', { verbatim: true })],
    summaryKeys: ['instanceUrl'],
  },
  {
    id: 'freshdesk',
    name: 'Freshdesk',
    description: 'Tickets and solution articles.',
    category: 'saas',
    logo: `${CONNECTOR_LOGO_BASE}freshdesk.svg`,
    icon: 'headset',
    fields: [F('domain', 'Domain', 'text', { placeholder: 'your-org.freshdesk.com' }), F('apiKey', 'API Key', 'secret')],
    summaryKeys: ['domain'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Products, policies and help pages.',
    category: 'saas',
    logo: `${CONNECTOR_LOGO_BASE}shopify.svg`,
    icon: 'cart',
    fields: [F('storeDomain', 'Store Domain', 'text', { placeholder: 'your-store.myshopify.com' }), F('adminAccessToken', 'Admin Access Token', 'secret')],
    summaryKeys: ['storeDomain'],
  },
  { id: 'stripe', name: 'Stripe', description: 'Products and their descriptions.', category: 'saas', logo: `${CONNECTOR_LOGO_BASE}stripe.svg`, icon: 'card', fields: [F('secretKey', 'Secret Key', 'secret')], summaryKeys: [] },

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
  { id: 'upload', name: 'File Upload', description: 'Files you upload.', category: 'web-files', icon: 'upload', fields: [], summaryKeys: [], single: true, catalogHidden: true },
];

export const CONNECTOR_BY_ID: Record<string, SourceConnector> = Object.fromEntries(SOURCE_CONNECTORS.map((c) => [c.id, c]));

/**
 * Connectors a source can be created from today. Every other connector is listed
 * in the catalog as "Coming soon" and cannot be added yet. Flip an id in here as
 * its backend lands — the catalog, quick-add row and forms pick it up with no
 * other change.
 */
export const ENABLED_CONNECTOR_IDS = new Set<string>(['upload', 'gdrive', 'google-calendar', 'salesforce', 'mysql', 'postgresql', 'mssql']);

/**
 * Connectors the browser feeds itself, registered straight on the engine. Every other enabled
 * connector runs as an integration the BFF deploys, of the type below (its id when not listed).
 */
export const ENGINE_NATIVE_CONNECTOR_IDS: ReadonlySet<string> = new Set(['upload']);

export const INTEGRATION_TYPE_BY_CONNECTOR: Record<string, string> = { gdrive: 'google_drive', 'google-calendar': 'google_calendar' };

/** Whether a source can be created from this connector yet. */
export const isConnectorEnabled = (id: string): boolean => ENABLED_CONNECTOR_IDS.has(id);

/** Connectors visible in the Add Source catalog (excludes hidden ones like File Upload). */
export const CATALOG_CONNECTORS: SourceConnector[] = SOURCE_CONNECTORS.filter((c) => !c.catalogHidden);

export const POPULAR_CONNECTORS: SourceConnector[] = CATALOG_CONNECTORS.filter((c) => c.popular).sort((a, b) => Number(isConnectorEnabled(b.id)) - Number(isConnectorEnabled(a.id)));

/** Live connectors offered as quick-add shortcuts, most useful first. */
export const QUICK_ADD_CONNECTORS: SourceConnector[] = CATALOG_CONNECTORS.filter((c) => isConnectorEnabled(c.id));

/** Connectors rendered per catalog page; the next page loads as the list scrolls into view. */
export const CATALOG_PAGE_SIZE = 24;

/** Blank config for a connector; `name` defaults to the connector's display name, fields to their defaults, and visibility to everyone who can query. */
export function blankSource(connectorId: string): ContextSourceConfig {
  const connector = CONNECTOR_BY_ID[connectorId];
  if (!connector) throw new Error(`Unknown source connector: ${connectorId}`);
  return { type: connector.id, name: connector.name, values: Object.fromEntries(connector.fields.map((f) => [f.key, f.defaultValue ?? ''])), audience: [], stagedVisibility: EVERYONE_VISIBILITY };
}

// ── Models step: embedding and language model providers ─────────────────────

export interface LlmProviderInfo {
  id: LlmProvider;
  name: string;
  /** Logo path under the public folder, resolved with {@link contextLogoUrl}. */
  logo: string;
  /** Light variant of a dark logo, for the dark theme. */
  logoDark?: string;
  /** Selectable model ids. Empty means the provider takes a free-text model id. */
  models: string[];
}

/**
 * Light logos for the embedding providers whose marks are dark, for the dark theme. The embedding list
 * belongs to RAG ingestion, so the Context Engine screens keep their own dark variants here.
 */
export const EMBEDDING_LOGO_DARK: Readonly<Record<string, string>> = { openai: `${GENAI_LOGO_BASE}openai-dark.svg`, mistral: `${GENAI_LOGO_BASE}mistral-dark.svg` };

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  { id: 'openai', name: 'OpenAI', logo: `${GENAI_LOGO_BASE}openai.svg`, logoDark: `${GENAI_LOGO_BASE}openai-dark.svg`, models: ['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra'] },
  { id: 'anthropic', name: 'Anthropic', logo: `${GENAI_LOGO_BASE}anthropic.svg`, logoDark: `${GENAI_LOGO_BASE}anthropic-dark.svg`, models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'] },
];

/** Embedding providers a context engine offers. RAG ingestion keeps its own, longer list. */
export const CONTEXT_EMBEDDING_PROVIDERS: EmbeddingProviderInfo[] = [{ id: 'openai', name: 'OpenAI', logo: `${GENAI_LOGO_BASE}openai.svg`, models: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'] }];

/** Display names for providers an engine may still run but the console no longer offers. */
export const RETIRED_MODEL_PROVIDER_NAMES: Record<string, string> = { azure_openai: 'Azure OpenAI', mistral: 'Mistral AI' };

export const LLM_AZURE_DEFAULT_API_VERSION = '2024-06-01';

export function blankLlm(provider: LlmProvider): LlmConfig {
  return { provider, model: '', apiKey: '', azureBaseUrl: '', azureApiVersion: provider === 'azure_openai' ? LLM_AZURE_DEFAULT_API_VERSION : '' };
}

// ── Engine limits and access model ──────────────────────────────────────────

/** The engine's root grant resource: every engine uses this id for grants and permissions on itself. */
export const CONTEXT_ENGINE_ID = 'engine';

/** The BFF's limit for an engine's name, which becomes part of its address. */
export const CONTEXT_ENGINE_HANDLE_MAX = 63;

/** Fetch an engine's console key again this long before it expires. */
export const CONSOLE_ACCESS_REFRESH_MARGIN_MS = 2 * 60 * 1000;

/** How often an engine that is starting is checked again. */
export const ENGINE_STATUS_POLL_MS = 4000;

/** How many engines the listing reads a summary from at once. */
export const SUMMARY_CONCURRENCY = 2;

/** Model providers the engine cannot be configured with yet. */
export const UNAVAILABLE_MODEL_PROVIDERS: ReadonlySet<string> = new Set(['azure_openai']);

/** Limits for an engine's display name and description. */
export const CONTEXT_ENGINE_NAME_MAX = 120;
export const CONTEXT_ENGINE_DESCRIPTION_MAX = 1000;
/** Shown under the description field: people browsing engines and AI agents connected over MCP both read it. */
export const CONTEXT_ENGINE_DESCRIPTION_HINT = 'Agents read this to decide when to search the engine.';

/** Engine actions a querying role receives — read context, open evidence, see the trace. */
export const CONTEXT_QUERY_ACTIONS = ['context.read', 'evidence.read', 'trace.read'] as const;

/** What the creator of an engine gets on it: query it, upload files and manage its sources. The engine grants creators nothing by itself. */
export const CONTEXT_OWNER_ACTIONS = ['context.read', 'evidence.read', 'trace.read', 'ingest.write', 'source.manage'] as const;

/** The creator's grant is keyed `owner-<principalId>`. */
export const OWNER_GRANT_PREFIX = 'owner-';

/** Grants created for an org role are keyed `role-<handle>` so they can be told apart from ad-hoc grants. */
export const ROLE_GRANT_PREFIX = 'role-';

export const CONTEXT_QUERY_DEFAULT_LIMIT = 10;
export const CONTEXT_QUERY_MAX_LENGTH = 10000;

/** The Playground's query modes, in the order the toggle shows them. */
export const CONTEXT_QUERY_MODES: readonly { value: ContextQueryMode; label: string; hint: string }[] = [
  { value: 'answer', label: 'Answer', hint: 'A cited answer from passages you can read.' },
  { value: 'context', label: 'Context', hint: 'Passages you can read, as an agent gets them.' },
];

/** Jobs stop being polled once they reach one of these. */
export const CONTEXT_JOB_TERMINAL_STATES = new Set(['succeeded', 'failed']);

// ── Exposure ────────────────────────────────────────────────────────────────

export interface ContextMcpToolInfo {
  name: string;
  description: string;
}

/** The tools the engine's MCP endpoint offers for this engine, as its MCP contract (`contracts/mcp/`) describes them. */
export const CONTEXT_MCP_TOOLS: ContextMcpToolInfo[] = [
  { name: 'get_context', description: 'Returns passages the caller may read that answer a question.' },
  { name: 'get_answer', description: 'Answers a question from those passages, with each [n] citing the nth passage.' },
];

// ── Source progress ─────────────────────────────────────────────────────────

/** Chip text for a source's place in the pipeline. */
export const SOURCE_PROGRESS_LABEL: Record<SourceProgressStatus, string> = {
  waiting: 'Waiting for data',
  reading: 'Syncing',
  processing: 'Syncing',
  indexing: 'Indexing',
  processed: 'Indexed',
  attention: 'Needs attention',
  empty: 'Nothing stored',
};

export const SOURCE_PROGRESS_TONE: Record<SourceProgressStatus, 'default' | 'info' | 'success' | 'warning'> = {
  waiting: 'default',
  reading: 'info',
  processing: 'info',
  indexing: 'info',
  processed: 'success',
  attention: 'warning',
  empty: 'default',
};

/** Progress polling: quick while any source is moving, slow otherwise so a sync started elsewhere still shows up. */
export const PROGRESS_POLL_ACTIVE_MS = 3000;
export const PROGRESS_POLL_IDLE_MS = 15000;

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
/** Set once the user has opened the API or MCP tab of an engine: the closest signal the console has that they connected an agent. */
export const CONTEXT_ENGINE_CONNECT_KEY_PREFIX = 'contextEngine:connectViewed:';

/** localStorage key of the files this browser uploaded to a source, until the engine can list a source's records. */
export const CONTEXT_ENGINE_FILES_KEY_PREFIX = 'contextEngine:files:';

/** localStorage key of the questions asked from this browser, per engine, until the engine lists a caller's stored queries. */
export const CONTEXT_ENGINE_QUESTIONS_KEY_PREFIX = 'contextEngine:questions:';

/** How many asked questions are kept per engine. */
export const ASKED_QUESTIONS_MAX = 20;

/** How many turns a Playground conversation keeps on the page. */
export const PLAYGROUND_TURNS_MAX = 20;

/** How often a list or page with an engine being deleted checks again. */
export const DELETION_POLL_MS = 3000;

/** localStorage key of a source's visibility rules as this browser last saved them, for the edit form and the upload rules check. */
export const CONTEXT_ENGINE_RULES_KEY_PREFIX = 'contextEngine:rules:';

/** The default for uploads: anyone who can query the engine can find the files. */
export const EVERYONE_VISIBILITY: FileVisibility = { kind: 'everyone' };

/** Choosing roles per source or file is turned off for now, so everything is shared with everyone who can query the engine. */
export const ROLE_VISIBILITY_ENABLED = false;

/** Suggested questions offered in an empty Playground; `{source}` is replaced by a source name. */
export const PLAYGROUND_SUGGESTIONS = ['Summarize what is in {source}', 'What should a new team member read first?', 'Which documents mention rate limits or quotas?'];

// ── File uploads ────────────────────────────────────────────────────────────

/** The engine's upload limit and type allowlist (its `CONTEXT_ENGINE_UPLOAD_*` settings). */
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

/** Content type by file extension. Browsers leave `File.type` empty for Markdown, so the name decides. */
export const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  txt: 'text/plain',
  text: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  json: 'application/json',
  csv: 'text/csv',
  pdf: 'application/pdf',
};

export const UPLOAD_ACCEPT = Object.keys(UPLOAD_CONTENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(',');

/** Files in flight at once from one browser; the engine's worker indexes one at a time anyway. */
export const UPLOAD_CONCURRENCY = 3;

/** How often an uploaded file's job and record are checked while it is still moving. */
export const UPLOAD_POLL_MS = 3000;

/** How often the "14 min so far" texts are refreshed. */
export const ELAPSED_TICK_MS = 30_000;

/** After this long on the engine, a file's row says that large files take long, so the wait does not look like a hang. */
export const UPLOAD_SLOW_AFTER_MS = 2 * 60_000;

/** The engine reads every file with its language model, so the time grows with the file. Seen: 3.4 MB of JSON took 58 minutes. */
export const UPLOAD_SLOW_NOTE = 'Large files can take an hour or more.';
/** Status reads in flight at once from one browser, so a restored list of files does not flood the engine. */
export const UPLOAD_CHECK_CONCURRENCY = 4;

/** Waits before reading a file's status again after the engine could not be reached, then every UPLOAD_CHECK_STEADY_MS. */
export const UPLOAD_CHECK_BACKOFF_MS = [3000, 6000, 12000] as const;
export const UPLOAD_CHECK_STEADY_MS = 30000;

/** Shown under a file whose status check did not reach the engine; its last status stays. */
export const UPLOAD_CHECK_RETRY_DETAIL = "Couldn't reach the engine to check this file. Trying again.";

/** After this long without reaching the engine, a file's status reads stop until "Check again". */
export const UPLOAD_CHECK_GIVE_UP_MS = 5 * 60_000;

/** Shown under a file whose status checks stopped; its last status stays. */
export const UPLOAD_CHECK_STOPPED_DETAIL = "Couldn't reach the engine to check this file.";

export const UPLOAD_STATUS_LABEL: Record<UploadFileStatus, string> = {
  uploading: 'Uploading',
  queued: 'Queued',
  indexing: 'Indexing',
  searchable: 'Searchable',
  stored: 'Stored, not searchable',
  unreadable: 'Not readable',
  held: 'Held back',
  failed: 'Failed',
};

export const UPLOAD_STATUS_TONE: Record<UploadFileStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  uploading: 'info',
  queued: 'info',
  indexing: 'info',
  searchable: 'success',
  stored: 'default',
  unreadable: 'warning',
  held: 'warning',
  failed: 'error',
};

// ── Storage backends ────────────────────────────────────────────────────────

export interface StorageBackendInfo {
  kind: StorageKind;
  title: string;
  purpose: string;
  /** The engine's embedded store. */
  managedName: string;
  /** The engine managed store when the deployment gives each engine its own PostgreSQL server. */
  serverName: string;
  /** Infrastructure list that can supply this store; null when Infrastructure offers none (the alternative is then external). */
  infraSegment: 'vector-databases' | 'databases' | null;
  /** Noun used in empty states and links, e.g. "vector database". */
  infraNoun: string;
  /** Engine provider ids sent in the configuration payload. */
  managedProvider: string;
  alternativeProvider: string;
}

export const STORAGE_BACKENDS: StorageBackendInfo[] = [
  {
    kind: 'vector',
    title: 'Vector database',
    purpose: 'Embeddings used to find relevant passages.',
    managedName: 'LanceDB',
    serverName: 'PostgreSQL + pgvector',
    infraSegment: 'vector-databases',
    infraNoun: 'vector database',
    managedProvider: 'lancedb',
    alternativeProvider: 'pgvector',
  },
  {
    kind: 'relational',
    title: 'Relational database',
    purpose: 'Records of your sources and the evidence behind answers.',
    managedName: 'SQLite',
    serverName: 'PostgreSQL',
    infraSegment: 'databases',
    infraNoun: 'database',
    managedProvider: 'sqlite',
    alternativeProvider: 'postgres',
  },
  {
    kind: 'graph',
    title: 'Graph database',
    purpose: 'Entities and relationships found in your sources.',
    managedName: 'Kuzu',
    serverName: 'PostgreSQL',
    infraSegment: null,
    infraNoun: 'graph database',
    managedProvider: 'kuzu',
    alternativeProvider: 'neo4j',
  },
];

export const STORAGE_BACKEND_BY_KIND: Record<StorageKind, StorageBackendInfo> = Object.fromEntries(STORAGE_BACKENDS.map((b) => [b.kind, b])) as Record<StorageKind, StorageBackendInfo>;

/** Every store on the engine's embedded default. */
export function defaultStorage(): ContextEngineStorage {
  return { vector: { mode: 'managed' }, relational: { mode: 'managed' }, graph: { mode: 'managed' } };
}

/** Default logical database name suggested for an Infrastructure server. */
export const STORAGE_DEFAULT_DATABASE: Record<StorageKind, string> = { vector: 'context_vectors', relational: 'context_engine', graph: 'neo4j' };
