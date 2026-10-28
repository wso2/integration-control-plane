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
 * Integration as API integration module. Covers REST API / GraphQL / WebSocket
 * services backed by `ballerinaService`, `miApiService`, `restApi`,
 * `miRestApi`. (Webhook components resolve to their own `webhook` type.)
 *
 * Composes the shared `EnvCardShell` frame via `HeaderStatus` (status dot +
 * Configure), `EnvCardActions` (Test / View Logs / Stop / Start), and a
 * content-only `EnvCardBody` (endpoint URLs + swagger + service insights).
 */
const integrationAsApiModule: IntegrationModule = {
  ...INTEGRATION_TYPE_INFO['integration-as-api'],
  HeaderStatus,
  EnvCardActions,
  EnvCardBody,
};

export default integrationAsApiModule;
