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

import type { CreateGitCredentialInput, CredentialDeleteEligibility, GitCredential } from '../types/credentials';

// Intentionally a stub: the BFF has no endpoints for this yet, so every call throws via ni().
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] credentials.${name}: not implemented`));

export const fetchGitCredentials = (): Promise<GitCredential[]> => ni('fetchGitCredentials');
export const createGitCredential = (_input: CreateGitCredentialInput): Promise<GitCredential> => ni('createGitCredential');
export const checkGitCredentialDeletion = (_credentialId: string): Promise<CredentialDeleteEligibility> => ni('checkGitCredentialDeletion');
export const deleteGitCredential = (_credentialId: string): Promise<void> => ni('deleteGitCredential');
