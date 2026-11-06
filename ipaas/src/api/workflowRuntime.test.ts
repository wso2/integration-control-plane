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
import { toWorkflowRuntime } from './workflowRuntime';

describe('toWorkflowRuntime', () => {
  it('maps the server name and namespaces', () => {
    expect(toWorkflowRuntime({ status: 'READY', server: { name: 'ipaas-workflows' }, namespaces: [{ environment: 'qa', namespace: 'qa-env' }] })).toEqual({
      status: 'READY',
      serverName: 'ipaas-workflows',
      namespaces: [{ environment: 'qa', namespace: 'qa-env' }],
    });
  });

  it('reads an unknown status as an error and a null list as empty', () => {
    expect(toWorkflowRuntime({ status: 'SOMETHING_NEW', namespaces: null })).toEqual({ status: 'ERROR', serverName: undefined, namespaces: [] });
  });
});
