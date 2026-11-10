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

import { describe, expect, it } from 'vitest';
import { VOICE_AGENT_BACKEND_SAMPLE, voiceAgentBackendEnv, voiceAgentGetTokenUrl } from './voiceAgentConnect';

describe('voice agent connect samples', () => {
  it('appends getToken to the token service URL once', () => {
    expect(voiceAgentGetTokenUrl('https://gw.example.com/agent-token-service')).toBe('https://gw.example.com/agent-token-service/getToken');
    expect(voiceAgentGetTokenUrl('https://gw.example.com/agent-token-service/')).toBe('https://gw.example.com/agent-token-service/getToken');
  });

  it('gives the backend the variable its sample reads', () => {
    expect(voiceAgentBackendEnv('https://gw.example.com/t')).toBe('VOICE_AGENT_TOKEN_URL=https://gw.example.com/t/getToken');
    expect(VOICE_AGENT_BACKEND_SAMPLE).toContain('process.env.VOICE_AGENT_TOKEN_URL');
  });
});
