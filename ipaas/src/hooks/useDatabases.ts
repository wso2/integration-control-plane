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
import { createDatabaseServer, deleteDatabaseServer, enableDatabaseBackups, fetchDatabaseAvailability, fetchDatabaseOffering, fetchDatabaseServer, fetchDatabaseServers, revealDatabaseCredentials } from '../api/databases';
import type { CreateDatabaseInput, DatabaseServer } from '../types/databases';
import { isBackupStarting, isTransitionalDatabaseStatus } from '../utils/databases';

const ROOT_KEY = 'databases';
const TRANSITION_POLL_MS = 10_000;
const IDLE_POLL_MS = 60_000;

const pollFor = (servers: Pick<DatabaseServer, 'status'>[] | undefined): number => (servers?.some((s) => isTransitionalDatabaseStatus(s.status)) ? TRANSITION_POLL_MS : IDLE_POLL_MS);

export function useDatabaseAvailability() {
  return useQuery({
    queryKey: [ROOT_KEY, 'availability'],
    queryFn: fetchDatabaseAvailability,
    staleTime: 60_000,
  });
}

export function useDatabaseOffering(enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'offering'],
    queryFn: fetchDatabaseOffering,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useDatabaseServers(enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'servers'],
    queryFn: fetchDatabaseServers,
    enabled,
    refetchInterval: (query) => pollFor(query.state.data),
  });
}

export function useDatabaseServer(serverId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'server', serverId],
    queryFn: () => fetchDatabaseServer(serverId),
    enabled: !!serverId,
    refetchInterval: (query) => (query.state.data?.reconciling || isBackupStarting(query.state.data) ? TRANSITION_POLL_MS : pollFor(query.state.data ? [query.state.data] : undefined)),
  });
}

export function useCreateDatabaseServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDatabaseInput) => createDatabaseServer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'servers'] }),
  });
}

/**
 * A mutation, not a query: every reveal is a fresh request to the provider, and
 * the credentials must not sit in the query cache. `gcTime: 0` drops them from
 * the mutation cache as soon as the view hides them or unmounts, and the keyed
 * observer resets when the page moves to another database.
 */
export function useRevealDatabaseCredentials(serverId: string) {
  return useMutation({
    mutationKey: [ROOT_KEY, 'reveal', serverId],
    mutationFn: () => revealDatabaseCredentials(serverId),
    gcTime: 0,
  });
}

export function useDeleteDatabaseServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => deleteDatabaseServer(serverId),
    onSuccess: (_, serverId) => {
      qc.removeQueries({ queryKey: [ROOT_KEY, 'server', serverId] });
      // Not awaited: the dialog closes as soon as the delete is accepted, while the list refreshes behind it.
      void qc.invalidateQueries({ queryKey: [ROOT_KEY, 'servers'] });
    },
  });
}

export function useEnableDatabaseBackups(serverId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Keyed by database, so an enable requested on one never shows as pending on another.
    mutationKey: [ROOT_KEY, 'enable-backups', serverId],
    mutationFn: () => enableDatabaseBackups(serverId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'server', serverId] }),
  });
}
