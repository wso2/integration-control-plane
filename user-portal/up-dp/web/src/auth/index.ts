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

export { AuthProvider, useAuth, type User } from './AuthProvider';
export { answerFrameSignIn, configureAuth, signIn } from './tokens';

import type { IntegrationKind } from '../types/portal';

/** The scope a user needs to run an automation. */
export const TRIGGER_SCOPE = 'automation:trigger';

/** The scope a user needs to see integrations of each kind. UP-DP enforces it; the SPA only hides what it would refuse. */
export const VIEW_SCOPES: Record<IntegrationKind, string> = {
  aiAgent: 'aiagent:view',
  automation: 'automation:view',
  workflow: 'workflow:view',
};
