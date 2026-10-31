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
import { linkOutcomeMessage } from './linkOutcome';

const write = { resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfCrm', environmentsWithoutValues: [] };

describe('linkOutcomeMessage', () => {
  it('says when each environment gets the link', () => {
    expect(linkOutcomeMessage({ ...write, workload: 'updated' }, false)).toEqual({
      severity: 'info',
      message: 'salesforce-sales is linked. Development gets it now; other environments get it when you promote to them.',
    });
    expect(linkOutcomeMessage({ ...write, workload: 'next_deploy' }, false).message).toBe("salesforce-sales is linked. Development gets it at the integration's next deploy; other environments get it when you promote to them.");
  });

  it('asks for a build when the current one cannot take a changed link', () => {
    expect(linkOutcomeMessage({ ...write, workload: 'next_build' }, true).message).toBe('salesforce-sales now goes through acme.sfdemo.sfCrm. Build again to use it.');
  });

  it('names the environments without values', () => {
    expect(linkOutcomeMessage({ ...write, workload: 'updated', environmentsWithoutValues: ['staging', 'production'] }, false)).toEqual({
      severity: 'warning',
      message: 'salesforce-sales is linked. Development gets it now; other environments get it when you promote to them. It has no values in staging and production yet; add them on WSO2 Cloud before you promote.',
    });
  });
});
