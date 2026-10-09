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
import { createChoreoConnection, createThirdPartyConnection, deleteConnection, getConnection, getConnectionServiceIdl, listConnectionCatalog, listConnections, refreshConnection } from '#api/connections';
import { IS_WIP } from '../../features';
import { ConnectionScope } from '../../types/connections';
import { useOrgs } from '../../hooks/useOrg';
import type { ConnectionCatalogKind, DeleteConnectionParams } from '../../types/connections';

const ROOT_KEY = 'connections';

/** Connections is a wip-only surface for now (cloud/icp API stubs throw). */
export function isConnectionsEnabled(): boolean {
  return IS_WIP;
}

interface ConnectionsScope {
  projectId: string;
  /** When set, list is scoped to a single component instead of the whole project. */
  componentId?: string;
}

/** Connections listing for a project (or a component when `componentId` is provided). */
export function useConnections({ projectId, componentId }: ConnectionsScope) {
  return useQuery({
    queryKey: [ROOT_KEY, 'list', projectId, componentId ?? null],
    queryFn: () => listConnections({ projectId, componentId, scope: componentId ? undefined : ConnectionScope.PROJECT, resolveServiceName: true }),
    enabled: isConnectionsEnabled() && !!projectId,
    retry: false,
  });
}

/** Org integer id (`orgIdInteger`) required in the Choreo connection create body. */
export function useOrgNumericId(orgHandle: string): number | undefined {
  const { data: orgs } = useOrgs();
  return orgs?.find((o) => o.handle === orgHandle)?.numericId;
}

/** Marketplace catalog for the create wizard (services / databases / resources). */
export function useConnectionCatalog(kind: ConnectionCatalogKind, projectId: string, opts?: { search?: string; filters?: Record<string, string>; limit?: number }) {
  return useQuery({
    queryKey: [ROOT_KEY, 'catalog', kind, projectId, opts?.search ?? '', opts?.filters ?? null],
    queryFn: () => listConnectionCatalog({ kind, projectId, search: opts?.search, filters: opts?.filters, limit: opts?.limit }),
    enabled: isConnectionsEnabled() && !!projectId,
    retry: false,
  });
}

/** A catalog service's API definition (OpenAPI) for the detail drawer's API Definition tab. */
export function useConnectionServiceIdl(serviceId: string, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'idl', serviceId],
    queryFn: () => getConnectionServiceIdl(serviceId),
    enabled: isConnectionsEnabled() && enabled && !!serviceId,
    retry: false,
  });
}

/** A single connection with its full per-environment configuration (detail/edit view). */
export function useConnection(groupUuid: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'detail', groupUuid],
    queryFn: () => getConnection(groupUuid),
    enabled: isConnectionsEnabled() && !!groupUuid,
    retry: false,
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: DeleteConnectionParams) => deleteConnection(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useCreateChoreoConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { request: Parameters<typeof createChoreoConnection>[0]; generateCreds?: boolean }) => createChoreoConnection(vars.request, vars.generateCreds),
    // Fire-and-forget: don't return the promise, so the mutation settles (and the
    // caller's onSuccess redirect fires) immediately instead of waiting for the
    // list refetch — the destination list refetches on mount anyway.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
  });
}

export function useCreateThirdPartyConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createThirdPartyConnection,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
  });
}

export function useRefreshConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: refreshConnection,
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}
