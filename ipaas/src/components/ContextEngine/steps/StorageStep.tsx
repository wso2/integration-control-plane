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

import { Box, Typography } from '@wso2/oxygen-ui';
import { useMemo, type JSX } from 'react';
import { isPlatformServicesEnabled, useDatabaseServers } from '../../../hooks/usePlatformServices';
import { useEngineManagedServer } from '../../../hooks/useContextEngine';
import { STORAGE_BACKENDS } from '../../../constants/contextEngine';
import { newOrgDatabaseUrl, newOrgVectorDatabaseUrl, orgDatabasesUrl, orgVectorDatabasesUrl } from '../../../paths';
import StorageBackendCard from './StorageBackendCard';
import DatabaseSection from './DatabaseSection';
import { stepHeadingSx, stepHintSx, storageGridSx } from '../styles';
import type { ContextEngineStorage, DatabaseChoice, EngineManagedServer, StorageKind, StorageSelection } from '../../../types/contextEngine';
import type { DatabaseServer } from '../../../types/platformServices';

interface StorageStepProps {
  orgHandle: string;
  storage: ContextEngineStorage;
  onChange: (kind: StorageKind, value: StorageSelection) => void;
  database: DatabaseChoice;
  onDatabaseChange: (value: DatabaseChoice) => void;
}

const MANAGED_HINT: Record<EngineManagedServer, string> = {
  embedded: 'The defaults are built in and need no setup.',
  postgres: 'Engine managed stores run on the engine’s own PostgreSQL server, created and deleted with it, and need no setup.',
};

/** Which Infrastructure servers can back a store: pgvector servers for vectors, plain PostgreSQL for relational. */
function serversFor(kind: StorageKind, servers: DatabaseServer[]): DatabaseServer[] {
  if (kind === 'vector') return servers.filter((s) => s.is_vector_enabled);
  if (kind === 'relational') return servers.filter((s) => s.type === 'postgres' && !s.is_vector_enabled);
  return [];
}

/** Step 4 — where the engine keeps its data: a database WSO2 Cloud manages, with its per-store placement, or the user's own PostgreSQL. */
export default function StorageStep({ orgHandle, storage, onChange, database, onDatabaseChange }: StorageStepProps): JSX.Element {
  const infrastructureAvailable = isPlatformServicesEnabled();
  const servers = useDatabaseServers();
  const all = useMemo(() => servers.data ?? [], [servers.data]);
  const managedServer = useEngineManagedServer();

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Configure storage
      </Typography>
      <Typography variant="body2" sx={stepHintSx}>
        Where the engine keeps its data.
      </Typography>

      <DatabaseSection value={database} onChange={onDatabaseChange} managedHint={managedServer.data ? MANAGED_HINT[managedServer.data] : undefined} />

      {/* Every store lives on the user's own server when they bring one, so the per-store placement applies only to the managed database. */}
      {database.mode === 'managed' && (
        <Box sx={storageGridSx}>
          {STORAGE_BACKENDS.map((info) => (
            <StorageBackendCard
              key={info.kind}
              info={info}
              managedServer={managedServer.data}
              value={storage[info.kind]}
              onChange={(value) => onChange(info.kind, value)}
              servers={serversFor(info.kind, all)}
              serversLoading={infrastructureAvailable && servers.isLoading}
              serversError={infrastructureAvailable && servers.isError}
              onRefresh={() => servers.refetch()}
              infrastructureAvailable={infrastructureAvailable}
              alternativeUnavailable
              listUrl={info.infraSegment === 'vector-databases' ? orgVectorDatabasesUrl(orgHandle) : info.infraSegment === 'databases' ? orgDatabasesUrl(orgHandle) : undefined}
              createUrl={info.infraSegment === 'vector-databases' ? newOrgVectorDatabaseUrl(orgHandle) : info.infraSegment === 'databases' ? newOrgDatabaseUrl(orgHandle) : undefined}
            />
          ))}
        </Box>
      )}
    </>
  );
}
