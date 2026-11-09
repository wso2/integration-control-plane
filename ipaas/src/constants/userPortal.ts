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

import type { IntegrationType } from '../types/integration';

/**
 * The integration types the User Portal shows. ipaas-service refuses to publish any other kind.
 * The Deploy page's environment cards show the User Portal row, and the Overview's env cards the
 * User Portal action, for exactly these.
 */
export const USER_PORTAL_TYPES: ReadonlySet<IntegrationType> = new Set<IntegrationType>(['ai-agent', 'automation', 'workflow']);
