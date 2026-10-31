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
import type { ResourceLink } from '../types/configuration';
import { type LinkSuggestionAction, linkSuggestionRows } from './linkSuggestions';

const connections = ['wso2.sfdemo.sfSales', 'wso2.sfdemo.support.sfSupport'];
const suggestions = [
  { resourceType: 'salesforce-sales', displayName: 'Salesforce (sales)', package: 'ballerinax/salesforce', connections, linked: false },
  { resourceType: 'salesforce-support', displayName: 'Salesforce (support)', package: 'ballerinax/salesforce', connections, linked: false },
];
const all = ['Link', 'Change link', 'Link through'] as const;
const rows = (s: typeof suggestions, links: ResourceLink[] = [], actions: LinkSuggestionAction[] = [...all]) => linkSuggestionRows(s, links, actions).map((r) => `${r.action} ${r.resourceType} → ${r.connection}`);

describe('linkSuggestionRows', () => {
  it('offers every resource of a variant through every connection', () => {
    expect(rows(suggestions)).toEqual(['Link salesforce-sales → wso2.sfdemo.sfSales', 'Link salesforce-sales → wso2.sfdemo.support.sfSupport', 'Link salesforce-support → wso2.sfdemo.sfSales', 'Link salesforce-support → wso2.sfdemo.support.sfSupport']);
  });

  it('leaves out the connection another link supplies', () => {
    const links: ResourceLink[] = [
      {
        resourceType: 'salesforce-sales',
        connection: 'wso2.sfdemo.sfSales',
        linked: true,
        environments: [{ name: 'development', inRelease: true, hasValues: true, connectionInBuild: true, configurables: { 'wso2.sfdemo.sfSalesBaseUrl': 'SALESFORCE_BASE_URL' } }],
      },
    ];
    expect(rows(suggestions.slice(1), links)).toEqual(['Link salesforce-support → wso2.sfdemo.support.sfSupport']);
  });

  it('leaves out a resource workload.yaml declares, and the connection its configurables are', () => {
    const declared: ResourceLink = {
      resourceType: 'salesforce-sales',
      linked: false,
      declared: true,
      environments: [{ name: 'development', inRelease: true, hasValues: true, connectionInBuild: false, configurables: { 'wso2.sfdemo.sfSalesBaseUrl': 'SALESFORCE_BASE_URL' } }],
    };
    expect(rows(suggestions, [declared])).toEqual(['Link salesforce-support → wso2.sfdemo.support.sfSupport']);
  });

  it('offers only the actions asked for', () => {
    const changed = { ...suggestions[0], linked: true, linkedConnection: 'wso2.sfdemo.sfCrm' } as (typeof suggestions)[0];
    expect(rows([changed, suggestions[1]], [], ['Link', 'Link through'])).toEqual(['Link salesforce-support → wso2.sfdemo.sfSales', 'Link salesforce-support → wso2.sfdemo.support.sfSupport']);
    expect(rows([changed, suggestions[1]], [], ['Change link'])).toEqual(['Change link salesforce-sales → wso2.sfdemo.sfSales', 'Change link salesforce-sales → wso2.sfdemo.support.sfSupport']);
  });

  it('changes a linked resource', () => {
    expect(rows([{ ...suggestions[0], linked: true, linkedConnection: 'wso2.sfdemo.sfCrm' } as (typeof suggestions)[0]])[0]).toBe('Change link salesforce-sales → wso2.sfdemo.sfSales');
    expect(rows([{ ...suggestions[0], linked: true } as (typeof suggestions)[0]])[0]).toBe('Link through salesforce-sales → wso2.sfdemo.sfSales');
  });
});
