/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
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
