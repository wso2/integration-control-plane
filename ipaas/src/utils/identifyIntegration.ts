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

import type { IntegrationIdentity, IntegrationRuntime } from '../types/integration';

/**
 * Standalone webhook variants (where `displayType` itself carries the
 * webhook role). Distinct from the Ballerina-service-with-webhook-subtype
 * case, which is handled via `componentSubType` below.
 */
const WEBHOOK_DISPLAY_TYPES = new Set(['webhook', 'ballerinaWebhook', 'miWebhook', 'byocWebhook', 'buildpackWebhook']);

/** The runtime a `displayType` implies. Every MI display type starts with `mi`. */
export function runtimeFromDisplayType(displayType: string): IntegrationRuntime {
  if (displayType.startsWith('mi')) return 'mi';
  if (displayType.startsWith('ballerina')) return 'ballerina';
  return 'unknown';
}

/**
 * The single source of truth for mapping a component's wire fields to an
 * `IntegrationIdentity`. Pure function — no React, no I/O. The resolution
 * order matters: `componentSubType`-based rules come first because some
 * subtypes override what `displayType` would otherwise imply (e.g. a
 * `ballerinaService` with `componentSubType === 'webhook'` is a Webhook,
 * not an Integration as API; a `ballerinaService` with
 * `componentSubType === 'MCP'` is an MCP Server, not an Integration as API).
 */
export function identifyIntegration(displayType: string, componentSubType: string | null): IntegrationIdentity {
  const raw = { displayType, componentSubType };

  // componentSubType-first: subtypes override their displayType's default meaning.
  if (componentSubType === 'tailscale') {
    return { type: 'tailscale-vpn', runtime: 'unknown', raw };
  }
  // RAG: the scheduled ingestion cronjob has its own Overview; the retrieval
  // service and the RAG API service are BYOI services surfaced as an
  // Integration as API (with no source/commit/build — gated in the page).
  if (componentSubType === 'rag-ingestion') {
    return { type: 'rag-ingestion', runtime: 'unknown', raw };
  }
  if (componentSubType === 'rag-retrieval-service' || componentSubType === 'rag-service') {
    return { type: 'integration-as-api', runtime: 'unknown', raw };
  }
  if (componentSubType === 'ballerinaFileIntegration') {
    return { type: 'file-integration', runtime: 'ballerina', raw };
  }
  if (componentSubType === 'miFileIntegration') {
    return { type: 'file-integration', runtime: 'mi', raw };
  }
  // Defensive: some components may carry the event-handler value in
  // `componentSubType`. The *primary* path for event integrations is the
  // `displayType` switch below — devant's create flow (and the backend) set
  // `displayType = mi/ballerinaEventHandler` with no subType, so these two
  // branches are a fallback, not the common case.
  if (componentSubType === 'ballerinaEventHandler') {
    return { type: 'event-integration', runtime: 'ballerina', raw };
  }
  if (componentSubType === 'miEventHandler') {
    return { type: 'event-integration', runtime: 'mi', raw };
  }
  if (componentSubType === 'aiAgent') {
    return { type: 'ai-agent', runtime: 'ballerina', raw };
  }
  if (componentSubType === 'MCP') {
    const isProxy = displayType === 'proxy' || displayType === 'gitProxy';
    if (isProxy) {
      return { type: 'mcp-proxy', runtime: 'unknown', raw };
    }
    return { type: 'mcp-server', runtime: runtimeFromDisplayType(displayType), raw };
  }
  if (componentSubType === 'webhook') {
    return { type: 'webhook', runtime: runtimeFromDisplayType(displayType), raw };
  }

  // displayType fallback for types whose identity lives entirely in displayType.
  if (WEBHOOK_DISPLAY_TYPES.has(displayType)) {
    return { type: 'webhook', runtime: runtimeFromDisplayType(displayType), raw };
  }

  switch (displayType) {
    case 'ballerinaService':
    case 'restApi':
      return { type: 'integration-as-api', runtime: 'ballerina', raw };
    case 'miApiService':
    case 'miRestApi':
      return { type: 'integration-as-api', runtime: 'mi', raw };
    case 'scheduledTask':
      return { type: 'automation', runtime: 'ballerina', raw };
    case 'miCronjob':
      return { type: 'automation', runtime: 'mi', raw };
    case 'byocEventHandler':
    case 'buildpackEventHandler':
      return { type: 'event-integration', runtime: 'unknown', raw };
    case 'ballerinaEventHandler':
      return { type: 'event-integration', runtime: 'ballerina', raw };
    case 'miEventHandler':
      return { type: 'event-integration', runtime: 'mi', raw };
    default:
      return { type: 'unsupported', runtime: 'unknown', raw };
  }
}
