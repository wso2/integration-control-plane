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

import { accessToken } from '../auth/tokens';
import { request } from './http';

/** An AI agent's chat endpoint on the gateway, called with the signed-in user's access token. */
export async function sendChatMessage(endpointUrl: string, sessionId: string, message: string): Promise<string> {
  const answer = await request<{ message?: unknown } | string | undefined>(`${endpointUrl.replace(/\/$/, '')}/chat`, {
    body: { sessionId, message },
    token: await accessToken(),
  });
  if (typeof answer === 'string') return answer;
  return typeof answer?.message === 'string' ? answer.message : JSON.stringify(answer ?? '');
}
