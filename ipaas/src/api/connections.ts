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

// Connections are not served by the BFF yet.
import type {
  ChoreoConnectionRequest,
  Connection,
  ConnectionCatalogResponse,
  ConnectionListingRecord,
  ConnectionRequest,
  ConnectionServiceIdl,
  ConnectionUpdatePayload,
  DeleteConnectionParams,
  EnvKeyRotationParams,
  ListCatalogParams,
  ListConnectionsParams,
  ResourceConnectionRequest,
  RotateConnectionKeysByConnectionIdParams,
} from '../types/connections';

const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] connections.${name}: not implemented`));

export const listConnections = (_params: ListConnectionsParams): Promise<ConnectionListingRecord[]> => ni('listConnections');
export const listConnectionCatalog = (_params: ListCatalogParams): Promise<ConnectionCatalogResponse> => ni('listConnectionCatalog');
export const getConnectionServiceIdl = (_serviceId: string): Promise<ConnectionServiceIdl> => ni('getConnectionServiceIdl');
export const getConnection = (_groupUuid: string): Promise<Connection> => ni('getConnection');
export const createChoreoConnection = (_request: ChoreoConnectionRequest, _generateCreds?: boolean): Promise<Connection> => ni('createChoreoConnection');
export const createResourceConnection = (_request: ResourceConnectionRequest): Promise<Connection> => ni('createResourceConnection');
export const createThirdPartyConnection = (_request: ConnectionRequest): Promise<Connection> => ni('createThirdPartyConnection');
export const createDatabaseConnection = (_request: ResourceConnectionRequest): Promise<Connection> => ni('createDatabaseConnection');
export const updateConnection = (_payload: ConnectionUpdatePayload): Promise<Connection> => ni('updateConnection');
export const deleteConnection = (_params: DeleteConnectionParams): Promise<void> => ni('deleteConnection');
export const refreshConnection = (_connectionId: string): Promise<Connection> => ni('refreshConnection');
export const rotateConnectionEnvKeys = (_params: EnvKeyRotationParams): Promise<void> => ni('rotateConnectionEnvKeys');
export const rotateConnectionKeysById = (_params: RotateConnectionKeysByConnectionIdParams): Promise<Connection> => ni('rotateConnectionKeysById');
