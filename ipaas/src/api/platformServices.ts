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

// Managed databases: availability + server-list endpoints no-op to empty on cloud
// so the read-only listing pages (Databases / Vector Databases / Message Brokers)
// render; the remaining server/Kafka functions stay ni() stubs until the BFF
// exposes them.
import type {
  AdminUser,
  AllowedIpsPayload,
  BackupsResponse,
  CaCertificate,
  CreateServerPayload,
  CredentialPayload,
  DatabaseInfo,
  DatabaseServer,
  DatabaseServerDetail,
  DbCredential,
  KafkaAcl,
  KafkaTopic,
  KafkaTopicCreatePayload,
  KafkaTopicUpdatePayload,
  KafkaUser,
  KafkaUserConfigs,
  LogsRequest,
  LogsResponse,
  MaintenanceWindow,
  MetricPeriod,
  OrgServiceAvailability,
  ServerMetricsResponse,
  ServerVariant,
  ServicePlan,
  ServiceType,
} from '../types/platformServices';

const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] platformServices.${name}: not implemented`));

// awaits: managed-database endpoints. Empty/neutral defaults keep the read-only
// listing pages (Databases / Vector Databases / Message Brokers) rendering with an
// empty state instead of throwing. reason 'UNKNOWN' yields the plain empty state
// (not the allow-list or upgrade banners); is_available: false keeps create gated.
export const getAvailability = (_orgUuid: string): Promise<OrgServiceAvailability> => Promise.resolve({ is_available: false, service_count_limit: 0, reason: 'UNKNOWN' });
export const listServers = (_orgUuid: string, _variant?: ServerVariant): Promise<DatabaseServer[]> => Promise.resolve([]);
export const getServer = (_serverId: string, _variant?: ServerVariant): Promise<DatabaseServerDetail> => ni('getServer');
export const deleteServer = (_serverId: string, _variant?: ServerVariant): Promise<void> => ni('deleteServer');
export const getServicePlans = (_type: ServiceType): Promise<ServicePlan[]> => ni('getServicePlans');
export const createServer = (_payload: CreateServerPayload, _variant?: ServerVariant): Promise<DatabaseServer> => ni('createServer');
export const setServerPoweredState = (_serverId: string, _powered: boolean, _variant?: ServerVariant): Promise<void> => ni('setServerPoweredState');
export const getServerAdminUser = (_serverId: string): Promise<AdminUser> => ni('getServerAdminUser');
export const getServerCaCertificate = (_serverId: string, _variant?: ServerVariant): Promise<CaCertificate> => ni('getServerCaCertificate');
export const getServerMetrics = (_serverId: string, _period: MetricPeriod, _variant?: ServerVariant): Promise<ServerMetricsResponse> => ni('getServerMetrics');
export const listServerDatabases = (_serverId: string): Promise<DatabaseInfo[]> => ni('listServerDatabases');
export const getServerLogs = (_serverId: string, _request: LogsRequest, _variant?: ServerVariant): Promise<LogsResponse> => ni('getServerLogs');
export const listServerBackups = (_serverId: string, _variant?: ServerVariant): Promise<BackupsResponse> => ni('listServerBackups');
export const createDatabase = (_serverId: string, _name: string): Promise<DatabaseInfo> => ni('createDatabase');
export const setDatabaseMarketplace = (_serverId: string, _name: string, _displayOnMarketplace: boolean): Promise<void> => ni('setDatabaseMarketplace');
export const listDbCredentials = (_serverId: string, _dbName?: string): Promise<DbCredential[]> => ni('listDbCredentials');
export const getDbCredential = (_serverId: string, _credentialId: string): Promise<DbCredential> => ni('getDbCredential');
export const createDbCredential = (_serverId: string, _payload: CredentialPayload): Promise<DbCredential> => ni('createDbCredential');
export const updateDbCredential = (_serverId: string, _credentialId: string, _payload: CredentialPayload): Promise<DbCredential> => ni('updateDbCredential');
export const deleteDbCredential = (_serverId: string, _credentialId: string): Promise<void> => ni('deleteDbCredential');
export const updateMaintenanceWindow = (_serverId: string, _payload: MaintenanceWindow, _variant?: ServerVariant): Promise<void> => ni('updateMaintenanceWindow');
export const updateAllowedIps = (_serverId: string, _payload: AllowedIpsPayload, _variant?: ServerVariant): Promise<void> => ni('updateAllowedIps');
export const listKafkaTopics = (_brokerId: string): Promise<KafkaTopic[]> => ni('listKafkaTopics');
export const createKafkaTopic = (_brokerId: string, _payload: KafkaTopicCreatePayload): Promise<void> => ni('createKafkaTopic');
export const getKafkaTopic = (_brokerId: string, _topicName: string): Promise<KafkaTopic> => ni('getKafkaTopic');
export const updateKafkaTopic = (_brokerId: string, _topicName: string, _payload: KafkaTopicUpdatePayload): Promise<void> => ni('updateKafkaTopic');
export const deleteKafkaTopic = (_brokerId: string, _topicName: string): Promise<void> => ni('deleteKafkaTopic');
export const getKafkaUserConfigs = (): Promise<KafkaUserConfigs> => ni('getKafkaUserConfigs');
export const listKafkaUsers = (_brokerId: string): Promise<KafkaUser[]> => ni('listKafkaUsers');
export const createKafkaUser = (_brokerId: string, _username: string): Promise<void> => ni('createKafkaUser');
export const deleteKafkaUser = (_brokerId: string, _username: string): Promise<void> => ni('deleteKafkaUser');
export const resetKafkaUserCredentials = (_brokerId: string, _username: string): Promise<void> => ni('resetKafkaUserCredentials');
export const listKafkaAcls = (_brokerId: string): Promise<{ acls: KafkaAcl[] }> => ni('listKafkaAcls');
export const createKafkaAcl = (_brokerId: string, _payload: Omit<KafkaAcl, 'id'>): Promise<void> => ni('createKafkaAcl');
export const deleteKafkaAcl = (_brokerId: string, _aclId: string): Promise<void> => ni('deleteKafkaAcl');
