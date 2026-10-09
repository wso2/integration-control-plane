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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  createDatabase,
  createDbCredential,
  createKafkaAcl,
  createKafkaTopic,
  createKafkaUser,
  createServer,
  deleteDbCredential,
  deleteKafkaAcl,
  deleteKafkaTopic,
  deleteKafkaUser,
  deleteServer,
  getAvailability,
  getDbCredential,
  getKafkaUserConfigs,
  getServer,
  getServerAdminUser,
  getServerCaCertificate,
  getServerLogs,
  getServerMetrics,
  getServicePlans,
  listDbCredentials,
  listKafkaAcls,
  listKafkaTopics,
  listKafkaUsers,
  listServerBackups,
  listServerDatabases,
  listServers,
  resetKafkaUserCredentials,
  setDatabaseMarketplace,
  setServerPoweredState,
  updateAllowedIps,
  updateDbCredential,
  updateKafkaTopic,
  updateMaintenanceWindow,
} from '#api/platformServices';
import { IS_CLOUD, IS_WIP } from '../../features';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { deriveProviders, deriveRegions } from '../utils/platformServices';
import type {
  AllowedIpsPayload,
  CloudProvider,
  CloudRegion,
  CreateServerPayload,
  CredentialPayload,
  DatabaseServer,
  KafkaAcl,
  KafkaTopicCreatePayload,
  KafkaTopicUpdatePayload,
  LogsRequest,
  MaintenanceWindow,
  MetricPeriod,
  ServerVariant,
  ServicePlan,
  ServiceType,
} from '../../types/platformServices';

const ROOT_KEY = 'platformServices';

/**
 * On wip, managed databases require the feature to be provisioned (build flag +
 * runtime config). cloud: render the read-only listing regardless of those wip
 * runtime flags, backed by no-op cloud services that return empty.
 */
export function isPlatformServicesEnabled(): boolean {
  return (IS_WIP && !!window.API_CONFIG?.enablePlatformServicesFeature && !!window.API_CONFIG?.platformServicesApiBaseUrl) || IS_CLOUD;
}

/** Org entitlement: whether another service can be provisioned, plus the count limit + reason. */
export function useServiceAvailability() {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT_KEY, 'availability', orgUuid],
    queryFn: () => getAvailability(orgUuid!),
    enabled: isPlatformServicesEnabled() && !!orgUuid,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/** All database servers in the org. Polls every 15s so provisioning progress is reflected. */
export function useDatabaseServers(variant: ServerVariant = 'db-servers') {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT_KEY, 'servers', orgUuid, variant],
    queryFn: () => listServers(orgUuid!, variant),
    enabled: isPlatformServicesEnabled() && !!orgUuid,
    refetchInterval: 15_000,
    retry: false,
  });
}

/** A single server. Polls fast (10s) while provisioning/resuming, slow (60s) otherwise. */
export function useDatabaseServer(serverId: string, variant: ServerVariant = 'db-servers') {
  return useQuery({
    queryKey: [ROOT_KEY, 'server', serverId, variant],
    queryFn: () => getServer(serverId, variant),
    enabled: isPlatformServicesEnabled() && !!serverId,
    refetchInterval: (query) => (['CREATING', 'RESUMING'].includes((query.state.data as DatabaseServer | undefined)?.status ?? '') ? 10_000 : 60_000),
    retry: false,
  });
}

export interface ServicePlansResult {
  plans: ServicePlan[];
  providers: CloudProvider[];
  regions: CloudRegion[];
}

/** Service plans for an engine, with the offered providers/regions derived for the wizard. */
export function useServicePlans(type: ServiceType) {
  return useQuery({
    queryKey: [ROOT_KEY, 'servicePlans', type],
    queryFn: () => getServicePlans(type),
    enabled: isPlatformServicesEnabled(),
    staleTime: 30 * 60 * 1000,
    select: (plans): ServicePlansResult => ({ plans, providers: deriveProviders(plans), regions: deriveRegions(plans) }),
  });
}

export function useCreateServer(variant: ServerVariant = 'db-servers') {
  const qc = useQueryClient();
  const orgUuid = useOrgUuid();
  return useMutation({
    mutationFn: (payload: CreateServerPayload) => createServer(payload, variant),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'servers', orgUuid, variant] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'availability', orgUuid] });
    },
  });
}

export function useDeleteServer(variant: ServerVariant = 'db-servers') {
  const qc = useQueryClient();
  const orgUuid = useOrgUuid();
  return useMutation({
    mutationFn: (serverId: string) => deleteServer(serverId, variant),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'servers', orgUuid, variant] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'availability', orgUuid] });
    },
  });
}

// --- server detail (management page) ---

/** Power a server on/off; refreshes the server detail on success. */
export function useSetServerPoweredState(serverId: string, variant: ServerVariant = 'db-servers') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (powered: boolean) => setServerPoweredState(serverId, powered, variant),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'server', serverId, variant] }),
  });
}

/** Reveal the admin user's password on demand (query is disabled until `enabled`). */
export function useServerAdminUser(serverId: string, enabled: boolean) {
  return useQuery({
    queryKey: [ROOT_KEY, 'adminUser', serverId],
    queryFn: () => getServerAdminUser(serverId),
    enabled: isPlatformServicesEnabled() && !!serverId && enabled,
    retry: false,
    // Sensitive: don't leave the password resident in the cache after the view unmounts.
    gcTime: 0,
  });
}

/** Lazy imperative fetch of the CA certificate (for the Download button). */
export function useFetchServerCaCertificate(serverId: string, variant: ServerVariant = 'db-servers') {
  const qc = useQueryClient();
  return () => qc.fetchQuery({ queryKey: [ROOT_KEY, 'caCert', serverId, variant], queryFn: () => getServerCaCertificate(serverId, variant) });
}

/** Time-series metrics for the given period. */
export function useServerMetrics(serverId: string, period: MetricPeriod, variant: ServerVariant = 'db-servers') {
  return useQuery({
    queryKey: [ROOT_KEY, 'metrics', serverId, period, variant],
    queryFn: () => getServerMetrics(serverId, period, variant),
    enabled: isPlatformServicesEnabled() && !!serverId,
    retry: false,
  });
}

/** The logical databases hosted on the server. */
export function useServerDatabases(serverId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'databases', serverId],
    queryFn: () => listServerDatabases(serverId),
    enabled: isPlatformServicesEnabled() && !!serverId,
    retry: false,
  });
}

/** Create a logical database, then refresh the database list. */
export function useCreateDatabase(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createDatabase(serverId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'databases', serverId] }),
  });
}

/** Add/remove a database from the Marketplace, then refresh the database list. */
export function useSetDatabaseMarketplace(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, display }: { name: string; display: boolean }) => setDatabaseMarketplace(serverId, name, display),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'databases', serverId] }),
  });
}

/** All credentials registered on the server (grouped by database in the UI). */
export function useDbCredentials(serverId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'credentials', serverId],
    queryFn: () => listDbCredentials(serverId),
    enabled: isPlatformServicesEnabled() && !!serverId,
    retry: false,
  });
}

/** A single credential (with username), for prefilling the edit dialog. */
export function useDbCredential(serverId: string, credentialId: string | null) {
  return useQuery({
    queryKey: [ROOT_KEY, 'credential', serverId, credentialId],
    queryFn: () => getDbCredential(serverId, credentialId!),
    enabled: isPlatformServicesEnabled() && !!serverId && !!credentialId,
    retry: false,
    // Sensitive: don't leave the credential resident in the cache after the dialog closes.
    gcTime: 0,
  });
}

function useInvalidateCredentials(serverId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [ROOT_KEY, 'credentials', serverId] });
    // Also clear the per-credential caches so a reused credential id refetches fresh data.
    qc.invalidateQueries({ queryKey: [ROOT_KEY, 'credential', serverId] });
  };
}

export function useCreateDbCredential(serverId: string) {
  const invalidate = useInvalidateCredentials(serverId);
  return useMutation({
    mutationFn: (payload: CredentialPayload) => createDbCredential(serverId, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateDbCredential(serverId: string) {
  const invalidate = useInvalidateCredentials(serverId);
  return useMutation({
    mutationFn: ({ credentialId, payload }: { credentialId: string; payload: CredentialPayload }) => updateDbCredential(serverId, credentialId, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteDbCredential(serverId: string) {
  const invalidate = useInvalidateCredentials(serverId);
  return useMutation({
    mutationFn: (credentialId: string) => deleteDbCredential(serverId, credentialId),
    onSuccess: invalidate,
  });
}

/** Update the maintenance window, then refresh the server detail. */
export function useUpdateMaintenanceWindow(serverId: string, variant: ServerVariant = 'db-servers') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MaintenanceWindow) => updateMaintenanceWindow(serverId, payload, variant),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'server', serverId, variant] }),
  });
}

/** Update the allowed-IP policy, then refresh the server detail. */
export function useUpdateAllowedIps(serverId: string, variant: ServerVariant = 'db-servers') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AllowedIpsPayload) => updateAllowedIps(serverId, payload, variant),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'server', serverId, variant] }),
  });
}

/** The server's automatic backups. */
export function useServerBackups(serverId: string, variant: ServerVariant = 'db-servers') {
  return useQuery({
    queryKey: [ROOT_KEY, 'backups', serverId, variant],
    queryFn: () => listServerBackups(serverId, variant),
    enabled: isPlatformServicesEnabled() && !!serverId,
    retry: false,
  });
}

/** Imperative log fetch — the Logs tab manages cursor paging + accumulation itself. */
export function useFetchServerLogs(serverId: string, variant: ServerVariant = 'db-servers') {
  return useCallback((request: LogsRequest) => getServerLogs(serverId, request, variant), [serverId, variant]);
}

// --- Kafka (message brokers only) ---

const KAFKA_KEY = 'kafka';

export function useKafkaTopics(brokerId: string) {
  return useQuery({
    queryKey: [KAFKA_KEY, 'topics', brokerId],
    queryFn: () => listKafkaTopics(brokerId),
    enabled: isPlatformServicesEnabled() && !!brokerId,
    retry: false,
  });
}

export function useKafkaUserConfigs() {
  return useQuery({
    queryKey: [KAFKA_KEY, 'user-configs'],
    queryFn: () => getKafkaUserConfigs(),
    enabled: isPlatformServicesEnabled(),
    staleTime: 60 * 60_000,
    retry: false,
  });
}

export function useKafkaUsers(brokerId: string) {
  return useQuery({
    queryKey: [KAFKA_KEY, 'users', brokerId],
    queryFn: () => listKafkaUsers(brokerId),
    enabled: isPlatformServicesEnabled() && !!brokerId,
    retry: false,
  });
}

export function useKafkaAcls(brokerId: string) {
  return useQuery({
    queryKey: [KAFKA_KEY, 'acls', brokerId],
    queryFn: () => listKafkaAcls(brokerId),
    enabled: isPlatformServicesEnabled() && !!brokerId,
    retry: false,
  });
}

export function useCreateKafkaTopic(brokerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: KafkaTopicCreatePayload) => createKafkaTopic(brokerId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KAFKA_KEY, 'topics', brokerId] }),
  });
}

export function useUpdateKafkaTopic(brokerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ topicName, payload }: { topicName: string; payload: KafkaTopicUpdatePayload }) => updateKafkaTopic(brokerId, topicName, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KAFKA_KEY, 'topics', brokerId] }),
  });
}

export function useDeleteKafkaTopic(brokerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicName: string) => deleteKafkaTopic(brokerId, topicName),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KAFKA_KEY, 'topics', brokerId] }),
  });
}

export function useCreateKafkaUser(brokerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => createKafkaUser(brokerId, username),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KAFKA_KEY, 'users', brokerId] }),
  });
}

export function useDeleteKafkaUser(brokerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => deleteKafkaUser(brokerId, username),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KAFKA_KEY, 'users', brokerId] }),
  });
}

export function useResetKafkaUserCredentials(brokerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => resetKafkaUserCredentials(brokerId, username),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KAFKA_KEY, 'users', brokerId] }),
  });
}

export function useCreateKafkaAcl(brokerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<KafkaAcl, 'id'>) => createKafkaAcl(brokerId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KAFKA_KEY, 'acls', brokerId] }),
  });
}

export function useDeleteKafkaAcl(brokerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aclId: string) => deleteKafkaAcl(brokerId, aclId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KAFKA_KEY, 'acls', brokerId] }),
  });
}
