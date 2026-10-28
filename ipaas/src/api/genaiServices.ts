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

// GenAI / Third-Party Services: the list endpoints no-op to empty on cloud so the
// read-only listing pages render; the remaining detail/create/update functions stay
// ni() stubs until the BFF exposes them.
import type {
  ConnectionConfigRequest,
  ConnectionConfigResponse,
  CreateServiceRequest,
  CreateServiceResponse,
  GenAiProviderTemplate,
  GenAiProviderTemplateDetail,
  GenAiService,
  GenAiServiceListResponse,
  GenAiServiceStatus,
  ServiceIdl,
  UpdateServiceRequest,
} from '../types/genaiServices';

const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] genaiServices.${name}: not implemented`));

// awaits: GenAI / third-party service list endpoints. Empty defaults keep the
// read-only listing pages rendering (with an empty state) instead of throwing.
const emptyServiceList = (params: { offset: number; limit: number }): Promise<GenAiServiceListResponse> => Promise.resolve({ count: 0, pagination: { limit: params.limit, total: 0, offset: params.offset }, data: [] });

export const listGenaiServices = (params: { query?: string; offset: number; limit: number; projectId?: string }): Promise<GenAiServiceListResponse> => emptyServiceList(params);
export const listThirdPartyServices = (params: { query?: string; offset: number; limit: number; projectId?: string }): Promise<GenAiServiceListResponse> => emptyServiceList(params);
export const listProviderTemplates = (): Promise<GenAiProviderTemplate[]> => ni('listProviderTemplates');
export const getProviderTemplate = (_templateId: string): Promise<GenAiProviderTemplateDetail> => ni('getProviderTemplate');
export const createGenaiService = (_request: CreateServiceRequest): Promise<CreateServiceResponse> => ni('createGenaiService');
export const getGenaiService = (_serviceId: string): Promise<GenAiService> => ni('getGenaiService');
export const updateGenaiService = (_serviceId: string, _request: UpdateServiceRequest): Promise<GenAiService> => ni('updateGenaiService');
export const getGenaiServiceIdl = (_serviceId: string): Promise<ServiceIdl> => ni('getGenaiServiceIdl');
export const updateGenaiServiceIdl = (_serviceId: string, _content: string): Promise<void> => ni('updateGenaiServiceIdl');
export const getConnectionConfig = (_serviceId: string, _schemaId: string): Promise<ConnectionConfigResponse> => ni('getConnectionConfig');
export const updateConnectionConfig = (_serviceId: string, _schemaId: string, _request: ConnectionConfigRequest): Promise<void> => ni('updateConnectionConfig');
export const addConnectionConfig = (_serviceId: string, _schemaId: string, _request: ConnectionConfigRequest): Promise<void> => ni('addConnectionConfig');
export const setGenaiServiceStatus = (_serviceId: string, _status: GenAiServiceStatus): Promise<void> => ni('setGenaiServiceStatus');
export const deleteGenaiService = (_serviceId: string): Promise<void> => ni('deleteGenaiService');
