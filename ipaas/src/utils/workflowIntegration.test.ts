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
import { isWorkflowIntegration, isWorkflowManagementEndpoint, managementApiLast } from './workflowIntegration';

const management = { displayName: 'Workflow Management API' };
const business = { displayName: 'Processorder' };

describe('isWorkflowIntegration', () => {
  it('tells a workflow integration from the others', () => {
    expect(isWorkflowIntegration({ displayType: 'ballerinaWorkflow', componentSubType: null })).toBe(true);
    expect(isWorkflowIntegration({ displayType: 'ballerinaService', componentSubType: null })).toBe(false);
    expect(isWorkflowIntegration(null)).toBe(false);
    expect(isWorkflowIntegration(undefined)).toBe(false);
  });
});

describe('isWorkflowManagementEndpoint', () => {
  it('knows the management API by its display name, whatever the case and spacing', () => {
    expect(isWorkflowManagementEndpoint(management)).toBe(true);
    expect(isWorkflowManagementEndpoint({ displayName: ' WORKFLOW MANAGEMENT API ' })).toBe(true);
    expect(isWorkflowManagementEndpoint(business)).toBe(false);
    expect(isWorkflowManagementEndpoint({ displayName: '' })).toBe(false);
  });
});

describe('managementApiLast', () => {
  it('moves the management API behind the others and keeps their order', () => {
    const other = { displayName: 'Refunds' };
    expect(managementApiLast([management, business, other])).toEqual([business, other, management]);
  });

  it('leaves the list it is given as it was', () => {
    const endpoints = [management, business];
    managementApiLast(endpoints);
    expect(endpoints).toEqual([management, business]);
  });
});
