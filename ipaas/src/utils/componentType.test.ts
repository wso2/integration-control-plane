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

import { describe, it, expect } from 'vitest';
import { getComponentTypeFlags, type ComponentTypeFlags } from './componentType';

const ALL_FALSE: ComponentTypeFlags = {
  isProxy: false,
  isService: false,
  isRestApi: false,
  isByoi: false,
  isAutomation: false,
  isCommitBased: false,
  isImageBased: false,
  isDeployable: false,
};

describe('getComponentTypeFlags', () => {
  it.each([
    ['proxy', { ...ALL_FALSE, isProxy: true }],
    ['gitProxy', { ...ALL_FALSE, isProxy: true }],
    ['ballerinaService', { ...ALL_FALSE, isService: true, isCommitBased: true, isDeployable: true }],
    ['miApiService', { ...ALL_FALSE, isService: true, isCommitBased: true, isDeployable: true }],
    ['restAPI', { ...ALL_FALSE, isRestApi: true, isCommitBased: true, isDeployable: true }],
    ['miRestApi', { ...ALL_FALSE, isRestApi: true, isCommitBased: true, isDeployable: true }],
    ['byoiService', { ...ALL_FALSE, isByoi: true, isImageBased: true, isDeployable: true }],
    ['scheduledTask', { ...ALL_FALSE, isAutomation: true, isCommitBased: true, isDeployable: true }],
    ['miCronjob', { ...ALL_FALSE, isAutomation: true, isCommitBased: true, isDeployable: true }],
    ['unknownType', ALL_FALSE],
    ['', ALL_FALSE],
  ] satisfies [string, ComponentTypeFlags][])('maps displayType %j to the expected flags', (displayType, expected) => {
    expect(getComponentTypeFlags(displayType)).toEqual(expected);
  });

  it('proxy is not deployable even though it is excluded from isCommitBased/isImageBased', () => {
    const flags = getComponentTypeFlags('proxy');
    expect(flags.isCommitBased).toBe(false);
    expect(flags.isImageBased).toBe(false);
    expect(flags.isDeployable).toBe(false);
  });

  it('componentSubType is accepted but does not change the result (reserved for future use)', () => {
    const withoutSubType = getComponentTypeFlags('ballerinaService');
    const withSubType = getComponentTypeFlags('ballerinaService', 'aiAgent');
    expect(withSubType).toEqual(withoutSubType);
  });

  it('componentSubType is optional', () => {
    expect(getComponentTypeFlags('miCronjob', null)).toEqual(getComponentTypeFlags('miCronjob'));
  });
});
