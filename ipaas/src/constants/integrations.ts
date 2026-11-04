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

import type { DisplayType } from '../types/component';
import type { Sample } from '../types/samples';
import { RAG_NO_SOURCE_SUBTYPES } from './ragIngestion';

/**
 * The set of integration display types that are supported by the ipaas.
 * Components whose displayType is not in this set should be treated as read-only / disabled.
 */
/**
 * Component display types that are "generic services" (Integration as API / REST API variants).
 * These get the service-specific environment card: deployment status, endpoint URLs, stop/start actions.
 */
export const GENERIC_SERVICE_TYPES = new Set(['ballerinaService', 'byocService', 'byoiService', 'miApiService', 'restApi', 'byocRestApi', 'miRestApi', 'buildRestApi', 'graphql', 'buildpackService']);

/** Bring-Your-Own-Image components (deploy a pre-built image) — gated features like External CI apply. */
export function isByoiComponent(displayType: string): boolean {
  return displayType.startsWith('byoi');
}

export const SUPPORTED_DISPLAY_TYPES = new Set([
  'restApi',
  'manualTrigger',
  'scheduledTask',
  'webhook',
  'miRestApi',
  'miEventHandler',
  'ballerinaService',
  'miApiService',
  'miCronjob',
  'miJob',
  'miWebhook',
  'ballerinaWorkflow',
  'byocWebhook',
  'buildpackWebhook',
  'ballerinaEventHandler',
  'ballerinaWebhook',
  'ballerinaFileIntegration',
  'miFileIntegration',
  'byoiService',
  'voiceAgent',
]);

/**
 * Whether a component is a supported (navigable, non-disabled) integration in
 * ICP listings. This disabled-row gating is ICP-specific (for the in-progress
 * type migration); devant has no equivalent. Keys primarily on `displayType`,
 * but is `componentSubType`-aware so types sharing a displayType resolve
 * correctly — notably an **MCP proxy** (`displayType: proxy` +
 * `componentSubType: MCP`) is supported, while a plain HTTP REST API proxy
 * (same displayType, no/`HTTP` subtype) stays unsupported.
 */
/** Buildpack of a component built by neither the Ballerina nor the MI runtime. */
export const OTHER_BUILDPACK = 'other';
export const MI_BUILDPACK = 'wso2-mi';
export const BI_BUILDPACK = 'BI';

// buildpackType is cloud-only; absent means unknown, so the displayType verdict stands.
export function isSupportedIntegration(displayType: string, componentSubType: string | null, buildpackType?: string): boolean {
  if (buildpackType === OTHER_BUILDPACK) return false;
  return SUPPORTED_DISPLAY_TYPES.has(displayType) || componentSubType === 'MCP' || RAG_NO_SOURCE_SUBTYPES.has(componentSubType ?? '');
}

export function getNonIntegrationPlatform(originCloud?: string): string {
  return originCloud === 'bijira' ? 'API Management' : 'WSO2 Developer Platform';
}

/**
 * Maps a component's displayType and componentSubType to a human-readable label.
 */
export function getDisplayLabel(displayType: string, componentSubType: string | null): string {
  switch (componentSubType) {
    case 'ballerinaFileIntegration':
    case 'miFileIntegration':
      return 'File Integration';
    case 'aiAgent':
      return 'AI Agent';
    case 'MCP':
      return 'MCP Server';
    case 'tailscale':
      return 'Tailscale VPN';
    case 'webhook':
      return 'Webhook';
    case 'rag-ingestion':
      return 'RAG Ingestion';
    case 'kb-ingestion':
      return 'Knowledge Base Data Source';
    case 'knowledge-base':
      return 'Knowledge Base Service';
    case 'rag-retrieval-service':
    case 'rag-service':
      return 'Integration as API';
  }
  switch (displayType) {
    case 'ballerinaService':
    case 'buildpackService':
    case 'byoiService':
    case 'byocService':
    case 'miApiService':
    case 'graphql':
    case 'thirdPartyApi':
    case 'prismMockService':
    case 'service':
      return 'Integration as API';
    case 'scheduledTask':
    case 'byocCronjob':
    case 'byoiCronjob':
    case 'miCronjob':
    case 'buildpackCronJob':
      return 'Automation';
    case 'manualTrigger':
      return 'Manual Trigger';
    case 'ballerinaWorkflow':
      return 'Workflow';
    case 'proxy':
    case 'gitProxy':
      return 'REST API Proxy';
    case 'webhook':
    case 'byocWebhook':
    case 'miWebhook':
    case 'buildpackWebhook':
    case 'ballerinaWebhook':
      return 'Webhook';
    case 'byocEventHandler':
    case 'miEventHandler':
    case 'buildpackEventHandler':
    case 'ballerinaEventHandler':
      return 'Event Integration';
    case 'restApi':
    case 'byocRestApi':
    case 'miRestApi':
    case 'buildRestApi':
      return 'Integration as an API';
    case 'byocWebApp':
    case 'byocWebAppsDockerfileLess':
    case 'byoiWebApp':
    case 'buildpackWebApp':
      return 'Web Application';
    case 'byocTestRunner':
    case 'buildpackTestRunner':
    case 'byocTestRunnerDockerfileLess':
      return 'Test Runner';
    case 'externalConsumer':
      return 'External Consumer';
    case 'byocJob':
    case 'byoiJob':
    case 'miJob':
    case 'buildpackJob':
      return 'Manual Task';
    case 'voiceAgent':
      return 'Voice Agent';
  }
  // Foreign-runtime components arrive as lower(buildpackType)+Cap(componentType), e.g. 'otherAiAgent'.
  if (displayType?.startsWith(OTHER_BUILDPACK)) return 'Other';
  return displayType ?? 'Unknown';
}

export const COMPONENT_TYPE_LABELS: Record<string, string> = {
  service: 'Integration as API',
  webhook: 'Webhook',
  'manual-task': 'Manual Task',
  'scheduled-task': 'Automation',
  automation: 'Automation',
  'ai-agent': 'AI Agent',
  'event-handler': 'Event Integration',
  'file-integration': 'File Integration',
  workflow: 'Workflow',
  'test-runner': 'Test Runner',
  'web-application': 'Web Application',
};

export function formatComponentType(type: string): string {
  return COMPONENT_TYPE_LABELS[type] ?? type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type SamplePathParts = Pick<Sample, 'subDirectory' | 'componentPath'>;

/**
 * A sample's path in its repository, as the create request's repositorySubPath.
 * The non-empty parts are joined with one slash, whether or not either supplies
 * its own, and a leading slash the catalog gives is kept.
 */
export function samplePath(sample: SamplePathParts): string {
  return [sample.subDirectory, sample.componentPath]
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/');
}

/**
 * A sample's id for usage analytics: its path in the samples repository, which
 * stays unique and stable when its display name changes.
 */
export function sampleId(sample: SamplePathParts): string {
  return samplePath(sample).replace(/^\/+/, '');
}

/** The sample's folder on GitHub, for the "Go to source" link. */
export function sampleSourceUrl(sample: SamplePathParts & Pick<Sample, 'repositoryUrl' | 'branch'>): string {
  return `${sample.repositoryUrl}tree/${sample.branch ?? 'main'}/${sampleId(sample)}`;
}

export function displayTypeFromSample(componentType: string, buildPack: string): DisplayType {
  const isMI = buildPack === MI_BUILDPACK;
  switch (componentType) {
    case 'service':
      return isMI ? 'miApiService' : 'ballerinaService';
    case 'scheduled-task':
      return isMI ? 'miCronjob' : 'scheduledTask';
    case 'automation':
      return isMI ? 'miCronjob' : 'scheduledTask';
    case 'manual-task':
      return isMI ? 'miJob' : 'manualTrigger';
    case 'event-handler':
      return isMI ? 'miEventHandler' : 'ballerinaEventHandler';
    case 'ai-agent':
      return isMI ? 'miApiService' : 'ballerinaService';
    case 'file-integration':
      return isMI ? 'miApiService' : 'ballerinaService';
    default:
      return isMI ? 'miApiService' : 'ballerinaService';
  }
}

/**
 * Maps a sample's `componentType` + `buildPack` to the `componentSubType`
 * the create API should receive. Returns `undefined` for sample categories
 * that share a `displayType` with another category and need no further
 * subtyping (regular services, automations, etc.).
 *
 * File Integration is the case that needs this: its displayType is the same as
 * a generic service (`ballerinaService` / `miApiService`), so the backend uses
 * `componentSubType` to distinguish it. Event handlers do NOT use this — they
 * carry their identity in `displayType` (see `displayTypeFromSample`), matching
 * devant's create flow.
 */
export function componentSubTypeFromSample(componentType: string, buildPack: string): string | undefined {
  if (componentType === 'file-integration') {
    return buildPack === MI_BUILDPACK ? 'miFileIntegration' : 'ballerinaFileIntegration';
  }
  // Webhooks build on the shared service runtime, so the subtype is what carries
  // the webhook identity through to the Component annotation.
  if (componentType === 'webhook') {
    return 'webhook';
  }
  // AI agents share a generic service displayType across runtimes; `aiAgent` is
  // the discriminator (runtime-independent), matching devant's create flow.
  if (componentType === 'ai-agent') {
    return 'aiAgent';
  }
  return undefined;
}

/** Product names of the two runtimes, shown wherever the user picks or reads an integration's technology. */
export const TECHNOLOGY_LABELS = {
  BI: 'WSO2 Integrator',
  MI: 'WSO2 Integrator: MI',
} as const;

export const BUILDPACK_LABELS: Record<string, string> = {
  ballerina: TECHNOLOGY_LABELS.BI,
  [MI_BUILDPACK]: TECHNOLOGY_LABELS.MI,
};

export function formatBuildPack(buildPack: string): string {
  return BUILDPACK_LABELS[buildPack] ?? buildPack;
}

/** Normalize 'automation' → 'scheduled-task' so both collapse under one Automation category */
export function normalizeComponentType(type: string): string {
  return type === 'automation' ? 'scheduled-task' : type;
}

export const ALLOWED_SAMPLE_TYPES = new Set(['service', 'scheduled-task', 'automation', 'file-integration', 'event-handler', 'ai-agent']);

export const APP_COLORS: Record<string, string> = {
  S: '#00a1e0', // Salesforce blue
  G: '#34a853', // Google green
  St: '#6772e5', // Stripe purple
  Sh: '#96bf48', // Shopify green
  Sl: '#4a154b', // Slack purple
  H: '#ff7a59', // HubSpot orange
};

export function getAppColor(name: string): string {
  const twoChar = name.slice(0, 2);
  return APP_COLORS[twoChar] ?? APP_COLORS[name.charAt(0)] ?? '#6366f1';
}

// ── Application connector icon URLs (same CDN as Devant) ─────────────────────

const CONNECTOR_ICON_CDN = 'https://devant-cdn.wso2.com/console/connector-icons/v1/';

const APPLICATION_ICONS: Record<string, string> = {
  Salesforce: `${CONNECTOR_ICON_CDN}Salesforce.svg`,
  'Google Sheets': `${CONNECTOR_ICON_CDN}GoogleSheets.svg`,
  'Google Chat': `${CONNECTOR_ICON_CDN}GoogleChat.svg`,
  'Google Forms': `${CONNECTOR_ICON_CDN}GoogleForms.svg`,
  'Google Drive': `${CONNECTOR_ICON_CDN}GoogleDrive.svg`,
  Gmail: `${CONNECTOR_ICON_CDN}Gmail.svg`,
  GitHub: `${CONNECTOR_ICON_CDN}GitHub.svg`,
  QuickBooks: `${CONNECTOR_ICON_CDN}QuickBooks.svg`,
  Stripe: `${CONNECTOR_ICON_CDN}Stripe.svg`,
  HubSpot: `${CONNECTOR_ICON_CDN}HubSpot.svg`,
  Mailchimp: `${CONNECTOR_ICON_CDN}Mailchimp.svg`,
  BambooHR: `${CONNECTOR_ICON_CDN}BambooHR.svg`,
  Slack: `${CONNECTOR_ICON_CDN}Slack.svg`,
  Shopify: `${CONNECTOR_ICON_CDN}Shopify.svg`,
  Xero: `${CONNECTOR_ICON_CDN}Xero.svg`,
  Zendesk: `${CONNECTOR_ICON_CDN}Zendesk.svg`,
  Airtable: `${CONNECTOR_ICON_CDN}Airtable.svg`,
  LinkedIn: `${CONNECTOR_ICON_CDN}LinkedIn.svg`,
  Workday: `${CONNECTOR_ICON_CDN}Workday.svg`,
  'Active Directory': `${CONNECTOR_ICON_CDN}ActiveDirectory.svg`,
  PayPal: `${CONNECTOR_ICON_CDN}Paypal.svg`,
  OpenAI: `${CONNECTOR_ICON_CDN}OpenAI.svg`,
  'AWS S3': `${CONNECTOR_ICON_CDN}AWS-S3.svg`,
  PostgreSQL: `${CONNECTOR_ICON_CDN}PostgreSQL.svg`,
  WooCommerce: `${CONNECTOR_ICON_CDN}WooCommerce.svg`,
  ADP: `${CONNECTOR_ICON_CDN}ADP.svg`,
  Twilio: `${CONNECTOR_ICON_CDN}Twilio.svg`,
  Twitter: `${CONNECTOR_ICON_CDN}Twitter.svg`,
  Jira: `${CONNECTOR_ICON_CDN}Jira.svg`,
  NetSuite: `${CONNECTOR_ICON_CDN}NetSuite.svg`,
};

export function getAppIconUrl(name: string): string | undefined {
  return APPLICATION_ICONS[name];
}
