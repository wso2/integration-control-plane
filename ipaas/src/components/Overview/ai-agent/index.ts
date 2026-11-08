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

import { INTEGRATION_TYPE_INFO } from '../../../constants/integrationTypes';
import type { IntegrationModule } from '../../../types/integration';
import HeaderStatus from './HeaderStatus';
import EnvCardActions from './EnvCardActions';
import EnvCardBody from './EnvCardBody';

/**
 * AI Agent integration module.
 *
 * Resolves from components whose `componentSubType` is `aiAgent` (they share a
 * service `displayType` — `ballerinaService` / `miApiService` — so the subtype
 * is the discriminator; see `identifyIntegration`).
 *
 * Builds and deploys like a service, but its env-card body is an inline chat
 * against the deployed agent (`AgentChat`), and Configure hides the Endpoints
 * step. Mirrors devant, where AI agents render a chat instead of the endpoint
 * metrics body and route Test to `test/agent-chat`.
 */
const aiAgentModule: IntegrationModule = {
  ...INTEGRATION_TYPE_INFO['ai-agent'],
  HeaderStatus,
  EnvCardActions,
  EnvCardBody,
};

export default aiAgentModule;
