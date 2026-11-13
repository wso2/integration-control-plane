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

import { AUTO_DEPLOY_AVAILABLE } from '../constants/build';
import type { Component } from '../types/component';
import { identifyIntegration } from './identifyIntegration';

/** The buildpackType ipaas-service reports for an MI integration. */
const MI_BUILDPACK_TYPE = 'MI';

/** Integrations the platform provisions without a build, so auto-deploy on build has nothing to act on. */
const UNBUILT_TYPES = new Set(['tailscale-vpn', 'rag-ingestion', 'mcp-proxy']);
const UNBUILT_SUBTYPES = new Set(['knowledge-base', 'rag-service', 'rag-retrieval-service']);

/** Mirrors ipaas-service's auto-deploy hold, so the Deploy page offers the switch only where it can be turned on. */
export function isAutoDeployOffered(c: Pick<Component, 'buildpackType' | 'displayType' | 'componentSubType' | 'isPrebuilt'>, enabled = false): boolean {
  const { type, runtime } = identifyIntegration(c.displayType ?? '', c.componentSubType ?? null);
  if (c.isPrebuilt || UNBUILT_TYPES.has(type) || UNBUILT_SUBTYPES.has(c.componentSubType ?? '')) return false;
  // Turning it off is always allowed, so a held integration that already has it on can still turn it off.
  if (enabled) return true;
  // A workflow's deploy also connects it to the workflow runtime, which only ipaas-service does.
  if (type === 'workflow') return false;
  // ipaas-service's deploy publishes their gateway API or MCP server, which an auto-deploy skips.
  if (type === 'integration-as-api' || type === 'mcp-server') return false;
  if (AUTO_DEPLOY_AVAILABLE) return true;
  // MI deploys one way, through ipaas-service.
  return c.buildpackType !== MI_BUILDPACK_TYPE && runtime !== 'mi';
}
