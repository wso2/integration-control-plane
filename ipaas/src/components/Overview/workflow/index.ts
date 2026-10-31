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
import HeaderStatus from '../integration-as-api/HeaderStatus';
import EnvCardActions from '../integration-as-api/EnvCardActions';
import EnvCardBody from './EnvCardBody';

/**
 * Workflow integration module. Resolves from the `ballerinaWorkflow` display type.
 *
 * A deployed workflow runs like a service (its engine serves the Workflow Management
 * API over HTTP), so it reuses integration-as-API's status and actions slots.
 */
const workflowModule: IntegrationModule = {
  ...INTEGRATION_TYPE_INFO.workflow,
  HeaderStatus,
  EnvCardActions,
  EnvCardBody,
};

export default workflowModule;
