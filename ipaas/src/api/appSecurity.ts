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

import type { Dataplane, IdentityProvider, IdentityProviderRequest, RoleGroupMappingResponse } from '../types/appSecurity';

// Intentionally a stub: the BFF has no endpoints for this yet, so every call throws via ni().
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] appSecurity.${name}: not implemented`));

export const fetchIdentityProviders = (): Promise<IdentityProvider[]> => ni('fetchIdentityProviders');
export const fetchIdentityProvider = (_id: string): Promise<IdentityProvider> => ni('fetchIdentityProvider');
export const createIdentityProvider = (_input: IdentityProviderRequest): Promise<IdentityProvider> => ni('createIdentityProvider');
export const updateIdentityProvider = (_id: string, _input: IdentityProviderRequest): Promise<IdentityProvider> => ni('updateIdentityProvider');
export const deleteIdentityProvider = (_id: string): Promise<void> => ni('deleteIdentityProvider');
export const fetchRoleGroupMappings = (): Promise<RoleGroupMappingResponse> => ni('fetchRoleGroupMappings');
export const updateRoleGroupMapping = (_roleId: string, _groups: string[]): Promise<void> => ni('updateRoleGroupMapping');
export const fetchDataplanes = (): Promise<Dataplane[]> => ni('fetchDataplanes');
