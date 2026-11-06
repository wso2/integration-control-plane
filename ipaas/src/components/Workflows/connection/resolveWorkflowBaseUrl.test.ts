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
import type { EnvEndpoint } from '../../../types/component';
import { NO_MANAGEMENT_ENDPOINT, resolveWorkflowBaseUrl, resolveWorkflowEndpoint } from './resolveWorkflowBaseUrl';

const GATEWAY = 'https://gw.e1-us-east-azure.example.dev/default';

function endpoint(patch: Partial<EnvEndpoint>): EnvEndpoint {
  return { id: 'ep-1', releaseId: 'release-1', environmentId: '', displayName: '', type: 'REST', visibility: 'Public', ...patch };
}

// As the live workflow integration's release lists them.
const management = endpoint({
  id: 'workflow-ma-cf1',
  displayName: 'Workflow Management API',
  port: 8234,
  publicUrl: `${GATEWAY}/orders-workflow-ma-cf1/v1.0`,
});

const business = endpoint({
  id: 'processorder',
  displayName: 'Order Processor API',
  port: 9090,
  publicUrl: `${GATEWAY}/orders-processorder/v1.0`,
});

describe('resolveWorkflowEndpoint', () => {
  it('picks the endpoint titled "Workflow Management API"', () => {
    expect(resolveWorkflowEndpoint([business, management])).toEqual({ status: 'ready', endpoint: management });
  });

  it('matches the title regardless of case and surrounding spaces', () => {
    const spelled = endpoint({ ...management, displayName: '  workflow management API ' });
    expect(resolveWorkflowEndpoint([spelled])).toEqual({ status: 'ready', endpoint: spelled });
  });

  it('recognises the endpoint by its title alone, never by its name or URL', () => {
    const byName = endpoint({ ...management, displayName: 'API' });
    const byUrl = endpoint({ ...business, publicUrl: management.publicUrl });
    // The title the module's 0.10.x spec used is a different API as far as the console knows.
    const otherTitle = endpoint({ ...management, displayName: 'Ballerina Workflow Management API' });
    expect(resolveWorkflowEndpoint([byName, byUrl, otherTitle])).toEqual({ status: 'unavailable', reason: NO_MANAGEMENT_ENDPOINT });
  });

  it('says the integration has no management endpoint when none is listed', () => {
    expect(resolveWorkflowEndpoint([])).toEqual({ status: 'unavailable', reason: 'This integration has no workflow management endpoint.' });
    expect(resolveWorkflowEndpoint([business])).toMatchObject({ status: 'unavailable' });
  });
});

describe('resolveWorkflowBaseUrl', () => {
  it('takes the gateway URL as it is, which already carries the API context', () => {
    expect(resolveWorkflowBaseUrl(`${GATEWAY}/orders-workflow-ma-cf1/v1.0`)).toBe(`${GATEWAY}/orders-workflow-ma-cf1/v1.0`);
  });

  it('drops a trailing slash, so the client paths join cleanly', () => {
    expect(resolveWorkflowBaseUrl(`${GATEWAY}/orders-workflow-ma-cf1/v1.0/`)).toBe(`${GATEWAY}/orders-workflow-ma-cf1/v1.0`);
  });
});
