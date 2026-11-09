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
 * RAG Ingestion overview module. The scheduled-ingestion cronjob reuses the
 * shared `EnvCardShell` frame: a status + Configure header (`HeaderStatus`), the
 * shared scheduled-task actions (`EnvCardActions` — Schedule + Test, same as
 * Automation), and a content body offering Executions | Retrieval tabs.
 * Source/commit and the Build card are hidden at the page level (it has no
 * source repo), and the Build tab shows a "not available" message.
 * `hideOpenInEditor` suppresses the "Open in Cloud / VS Code" entry point.
 */
const ragIngestionModule: IntegrationModule = {
  ...INTEGRATION_TYPE_INFO['rag-ingestion'],
  HeaderStatus,
  EnvCardActions,
  EnvCardBody,
  hideOpenInEditor: true,
};

export default ragIngestionModule;
