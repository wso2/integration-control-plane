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
import { createTemporalServer, deleteTemporalServer, fetchTemporalOffering, fetchTemporalServer, fetchTemporalServers, revealTemporalCredentials } from '../api/temporal';
import type { CreateTemporalInput, TemporalServer } from '../types/temporal';
import { isTransitionalDatabaseStatus } from '../utils/databases';

const ROOT_KEY = 'temporal';
const TRANSITION_POLL_MS = 10_000;
const IDLE_POLL_MS = 60_000;

const pollFor = (servers: Pick<TemporalServer, 'status'>[] | undefined): number => (servers?.some((s) => isTransitionalDatabaseStatus(s.status)) ? TRANSITION_POLL_MS : IDLE_POLL_MS);

export function useTemporalOffering(enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'offering'],
    queryFn: fetchTemporalOffering,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useTemporalServers(enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'servers'],
    queryFn: fetchTemporalServers,
    enabled,
    refetchInterval: (query) => pollFor(query.state.data),
  });
}

export function useTemporalServer(serverId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'server', serverId],
    queryFn: () => fetchTemporalServer(serverId),
    enabled: !!serverId,
    refetchInterval: (query) => pollFor(query.state.data ? [query.state.data] : undefined),
  });
}

export function useCreateTemporalServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemporalInput) => createTemporalServer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'servers'] }),
  });
}

/**
 * A mutation, not a query: every reveal is a fresh request to the provider, and
 * the key must not sit in the query cache.
 */
export function useRevealTemporalCredentials(serverId: string) {
  return useMutation({
    mutationFn: () => revealTemporalCredentials(serverId),
  });
}

export function useDeleteTemporalServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => deleteTemporalServer(serverId),
    onSuccess: (_, serverId) => {
      qc.removeQueries({ queryKey: [ROOT_KEY, 'server', serverId] });
      return qc.invalidateQueries({ queryKey: [ROOT_KEY, 'servers'] });
    },
  });
}
