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

import { Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Avatar, Box, Button, Chip, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { ChevronDown, Database, Plus } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useDbCredentials, useServerDatabases } from '../../../hooks/usePlatformServices';
import { DB_MARKETPLACE_FILTERS, DB_STATUS, type DbMarketplaceFilter } from '../../../../constants/platformServices';
import { matchesDatabaseFilter } from '../../../utils/platformServices';
import SearchField from '../../../../components/SearchField';
import CreateDatabaseDialog from './databases/CreateDatabaseDialog';
import DatabaseCredentials from './databases/DatabaseCredentials';
import MarketplaceToggleButton from './databases/MarketplaceToggleButton';
import type { DatabaseServerDetail, DbCredential } from '../../../../types/platformServices';

export default function DatabasesTab({ service, orgHandle }: { service: DatabaseServerDetail; orgHandle: string }): JSX.Element {
  const serverId = service.id;
  const defaultUser = service.connection_params.user;
  const isPoweredOn = service.status === 'ACTIVE';

  const databasesQuery = useServerDatabases(serverId);
  const credentialsQuery = useDbCredentials(serverId);

  const [filters, setFilters] = useState<DbMarketplaceFilter[]>([...DB_MARKETPLACE_FILTERS]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const notify = (type: 'success' | 'error', message: string) => setAlert({ type, message });

  const databases = useMemo(() => databasesQuery.data ?? [], [databasesQuery.data]);

  const credentialsByDb = useMemo(() => {
    const map: Record<string, DbCredential[]> = {};
    for (const cred of credentialsQuery.data ?? []) {
      (map[cred.database_name] ??= []).push(cred);
    }
    return map;
  }, [credentialsQuery.data]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return databases.filter((db) => {
      const count = credentialsByDb[db.name]?.length ?? 0;
      return matchesDatabaseFilter(db, count, filters) && (q === '' || db.name.toLowerCase().includes(q));
    });
  }, [databases, credentialsByDb, filters, search]);

  if (databasesQuery.isLoading || credentialsQuery.isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  if (databasesQuery.isError || credentialsQuery.isError) {
    const retry = () => {
      if (databasesQuery.isError) databasesQuery.refetch();
      if (credentialsQuery.isError) credentialsQuery.refetch();
    };
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={retry}>
            Retry
          </Button>
        }>
        {databasesQuery.isError ? 'Failed to load databases.' : 'Failed to load database credentials.'}
      </Alert>
    );
  }

  return (
    <Box>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {/* Toolbar */}
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
            Filter by:
          </Typography>
          <Autocomplete
            multiple
            size="small"
            options={[...DB_MARKETPLACE_FILTERS]}
            value={filters}
            onChange={(_, value) => setFilters(value)}
            limitTags={1}
            sx={{ minWidth: 280 }}
            renderTags={(value, getTagProps) => value.map((option, index) => <Chip label={option} size="small" {...getTagProps({ index })} key={option} />)}
            renderInput={(params) => <TextField {...params} placeholder={filters.length === 0 ? 'Select marketplace status' : ''} />}
          />
        </Stack>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <SearchField value={search} onChange={setSearch} placeholder="Search databases" />
          <Button variant="contained" size="small" startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)} sx={{ flexShrink: 0 }}>
            Create
          </Button>
        </Stack>
      </Stack>

      {databases.length === 0 ? (
        <Alert severity="info">No databases have been created on this server yet.</Alert>
      ) : visible.length === 0 ? (
        <Alert severity="info">No databases match the current filters.</Alert>
      ) : (
        <Stack gap={1}>
          {visible.map((db) => {
            const creds = credentialsByDb[db.name] ?? [];
            const isDeleted = db.status === DB_STATUS.NOT_FOUND_IN_SERVER;
            return (
              <Accordion
                key={db.name}
                disableGutters
                elevation={0}
                expanded={expanded === db.name}
                onChange={(_, isExp) => setExpanded(isExp ? db.name : null)}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}>
                <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                  <Stack direction="row" alignItems="center" gap={1.5} sx={{ flex: 1, pr: 1 }} flexWrap="wrap">
                    <Avatar sx={{ width: 28, height: 28, bgcolor: 'action.selected', color: 'text.primary' }}>
                      <Database size={16} />
                    </Avatar>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {db.name}
                    </Typography>
                    <Chip label={`${creds.length} credential(s)`} size="small" variant="outlined" />
                    {isDeleted ? <Chip label="Deleted from the server" size="small" color="error" variant="outlined" /> : db.display_on_marketplace && <Chip label="Available in Marketplace" size="small" color="success" variant="outlined" />}
                    <Box sx={{ flex: 1 }} />
                    <MarketplaceToggleButton serverId={serverId} database={db} isCredsAvailable={creds.length > 0} onImportCredentials={() => setExpanded(db.name)} notify={notify} />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                  <DatabaseCredentials
                    serverId={serverId}
                    orgHandle={orgHandle}
                    dbName={db.name}
                    credentials={creds}
                    defaultUser={defaultUser}
                    isPoweredOn={isPoweredOn}
                    isDbDeleted={isDeleted}
                    isAddedToMarketplace={db.display_on_marketplace}
                    notify={notify}
                  />
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}

      {createOpen && <CreateDatabaseDialog serverId={serverId} existingNames={databases.map((d) => d.name)} onClose={() => setCreateOpen(false)} notify={notify} />}
    </Box>
  );
}
