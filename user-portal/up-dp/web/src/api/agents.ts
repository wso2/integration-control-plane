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
