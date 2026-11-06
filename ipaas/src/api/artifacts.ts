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

import type { ArtifactType, Artifact, ArtifactParam, ArtifactStatusInput, ListenerStateInput } from '../types/artifact';

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] artifacts.${name}: not implemented`));

export const fetchArtifactTypes = (_componentId: string, _envId: string): Promise<ArtifactType[]> => ni('fetchArtifactTypes');
export const fetchArtifacts = (_artifactType: string, _envId: string, _componentId: string): Promise<Artifact[]> => ni('fetchArtifacts');
export const fetchArtifactSource = (_envId: string, _componentId: string, _artifactType: string, _artifactName: string): Promise<string> => ni('fetchArtifactSource');
export const fetchLocalEntryValue = (_componentId: string, _entryName: string, _envId: string): Promise<string> => ni('fetchLocalEntryValue');
export const fetchArtifactParams = (_componentId: string, _artifactType: string, _artifactName: string, _envId: string, _runtimeId?: string): Promise<ArtifactParam[]> => ni('fetchArtifactParams');
export const fetchArtifactWsdl = (_componentId: string, _artifactType: string, _artifactName: string, _envId: string, _runtimeId?: string): Promise<string> => ni('fetchArtifactWsdl');
export const updateArtifactStatus = (_input: ArtifactStatusInput): Promise<{ status: string; message: string }> => ni('updateArtifactStatus');
export const updateListenerState = (_input: ListenerStateInput): Promise<{ success: boolean; message: string; commandIds: string[] }> => ni('updateListenerState');
export const ARTIFACT_QUERY_MAP: Partial<Record<string, { queryName: string; field: string; fields: string; gqlFields: string }>> = {};
