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

// Context Engines are wip-only for now (the Devant Context Engine service). Signatures mirror Contracts.ContextEngineApi.

import type {
  ContextEngine,
  ContextEngineDetail,
  ContextEngineProgress,
  ContextRecordStatus,
  ContextSource,
  ContextSourceConfig,
  IngestFileInput,
  UpdateContextSourceInput,
  RecordEventInput,
  ContextGrant,
  ContextJob,
  ContextJobHandle,
  ContextPrincipal,
  ContextQueryInput,
  ContextQueryResult,
  CreateContextEngineInput,
  CreateContextEngineResult,
  PutContextGrantInput,
  ContextEngineModels,
  ContextEvidence,
  UpdateContextModelsInput,
  ContextQueryTrace,
  ContextGraph,
  ContextEntityView,
} from '../../types/contextEngine';

const ni = (name: string): never => {
  throw new Error(`[cloud] contextEngine.${name}: not implemented`);
};

export const supportsContextEngineProvisioning = false;
export const listContextEngines = (): Promise<ContextEngine[]> => ni('listContextEngines');
export const getContextEngine = (_engineId: string): Promise<ContextEngineDetail> => ni('getContextEngine');
export const createContextEngine = (_input: CreateContextEngineInput): Promise<CreateContextEngineResult> => ni('createContextEngine');
export const deleteContextEngine = (_engineId: string): Promise<ContextJobHandle | null> => ni('deleteContextEngine');
export const updateContextModels = (_input: UpdateContextModelsInput): Promise<ContextEngineModels> => ni('updateContextModels');
export const getContextEngineProgress = (_engineId: string): Promise<ContextEngineProgress> => ni('getContextEngineProgress');
export const ingestContextFile = (_input: IngestFileInput): Promise<ContextJobHandle> => ni('ingestContextFile');
export const hashContent = (_content: Blob): Promise<string> => ni('hashContent');
export const retryContextJob = (_jobId: string): Promise<ContextJobHandle> => ni('retryContextJob');
export const sendContextRecordEvent = (_input: RecordEventInput): Promise<ContextJobHandle> => ni('sendContextRecordEvent');
export const getContextRecordStatus = (_sourceId: string, _recordId: string): Promise<ContextRecordStatus> => ni('getContextRecordStatus');
export const addContextSource = (_engineId: string, _source: ContextSourceConfig): Promise<ContextSource> => ni('addContextSource');
export const updateContextSource = (_input: UpdateContextSourceInput): Promise<ContextSource> => ni('updateContextSource');
export const getContextJob = (_jobId: string): Promise<ContextJob> => ni('getContextJob');
export const queryContextEngine = (_input: ContextQueryInput): Promise<ContextQueryResult> => ni('queryContextEngine');
export const getContextQuery = (_queryId: string): Promise<ContextQueryResult> => ni('getContextQuery');
export const getContextQueryTrace = (_queryId: string): Promise<ContextQueryTrace | null> => ni('getContextQueryTrace');
export const getContextGraph = (_engineId: string, _limit: number): Promise<ContextGraph | null> => ni('getContextGraph');
export const getContextEntity = (_engineId: string, _name: string, _limit?: number, _kind?: string): Promise<ContextEntityView> => ni('getContextEntity');
export const getContextEvidence = (_evidenceId: string): Promise<ContextEvidence> => ni('getContextEvidence');
export const getContextPermissions = (_resourceId: string): Promise<string[]> => ni('getContextPermissions');
export const listContextGrants = (_engineId: string): Promise<ContextGrant[]> => ni('listContextGrants');
export const putContextGrant = (_input: PutContextGrantInput): Promise<ContextGrant> => ni('putContextGrant');
export const deleteContextGrant = (_engineId: string, _grantId: string): Promise<void> => ni('deleteContextGrant');
export const getContextPrincipal = (): Promise<ContextPrincipal> => ni('getContextPrincipal');
