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
import { hasIntegrationTraces } from './integrationTraces';

/** The buildpackType ipaas-service reports for an MI integration. */
const MI_BUILDPACK_TYPE = 'MI';

/**
 * Whether the Deploy page offers "Auto deploy on build" for the integration. While
 * AUTO_DEPLOY_AVAILABLE is off, ipaas-service keeps auto-deploy off, and refuses turning it on,
 * for the integrations whose deploys it makes itself, so the switch is not offered for them:
 *
 * - Ballerina integrations: a deploy sets up their tracing.
 * - MI integrations: a deploy queues the publishing of an MI API's endpoints on the API gateway,
 *   which a build OpenChoreo deploys on its own never gets, and every MI type deploys the same way.
 */
export function isAutoDeployOffered(c: Pick<Component, 'buildpackType' | 'displayType' | 'componentSubType'>): boolean {
  if (AUTO_DEPLOY_AVAILABLE) return true;
  const isMI = c.buildpackType === MI_BUILDPACK_TYPE || identifyIntegration(c.displayType ?? '', c.componentSubType ?? null).runtime === 'mi';
  return !isMI && !hasIntegrationTraces(c);
}
