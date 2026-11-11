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

import type { ReactNode } from 'react';
import type { EnvCardActionsProps } from '../../../types/integration';
import ApiEnvCardActions from '../integration-as-api/EnvCardActions';

/**
 * A workflow's right-header slot: the actions integration-as-API offers (View logs, Stop/Start/Redeploy)
 * without Test, as a workflow has no Test page. The User Portal switch is in the card's footer.
 */
export default function EnvCardActions(props: EnvCardActionsProps): ReactNode {
  return <ApiEnvCardActions {...props} hideTest />;
}
