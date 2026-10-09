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

import { Alert, Box, Button, CircularProgress, Grid, InputAdornment, MenuItem, PageContent, Pagination, Select, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { ArrowLeft, Plus, Search } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type Dispatch, type JSX, type SetStateAction } from 'react';
import { useAppNavigate } from '../../../../hooks/useAppNavigate';
import { useConnectionCatalog } from '../../../hooks/useConnections';
import { CATEGORY_FILTERS, DB_CLOUD_PROVIDER_FILTERS, DB_STORAGE_TYPE_FILTERS, RESOURCE_PAGE_SIZE, RESOURCE_TAB_LABELS, SERVICE_TYPE_FILTERS, SERVICE_VISIBILITY_FILTERS } from '../../../constants/connections';
import { ConnectionCatalogKind } from '../../../../types/connections';
import FilterSection from '../../../../components/FilterSection';
import ResourceCard from './ResourceCard';
import ServiceDetailDrawer from './ServiceDetailDrawer';
import type { ConnectionCatalogItem, ResourceTab } from '../../../../types/connections';

interface ResourcePickerProps {
  org: string;
  projectId: string | undefined;
  /** Current component id when creating an integration-level connection (excluded from the catalog). */
  componentId?: string;
  base: string;
  isLoading: boolean;
  initialTab: ResourceTab;
  onPick: (item: ConnectionCatalogItem) => void;
}

type SortBy = 'name-asc' | 'name-desc';

const toggleInSet = (setter: Dispatch<SetStateAction<Set<string>>>) => (value: string) =>
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });

export default function ResourcePicker({ org, projectId, componentId, base, isLoading: projectLoading, initialTab, onPick }: ResourcePickerProps): JSX.Element {
  const navigate = useAppNavigate();
  const [tab, setTab] = useState<ResourceTab>(initialTab);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name-asc');
  const [selectedTypes, setSelectedTypes] = useState(new Set(SERVICE_TYPE_FILTERS));
  const [selectedVisibility, setSelectedVisibility] = useState(new Set(SERVICE_VISIBILITY_FILTERS));
  const [selectedStorageTypes, setSelectedStorageTypes] = useState(new Set(DB_STORAGE_TYPE_FILTERS));
  const [selectedCloudProviders, setSelectedCloudProviders] = useState(new Set(DB_CLOUD_PROVIDER_FILTERS));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<ConnectionCatalogItem | null>(null);
  const [page, setPage] = useState(1);

  const kind = tab === 'services' ? ConnectionCatalogKind.SERVICES : tab === 'databases' ? ConnectionCatalogKind.DATABASES : ConnectionCatalogKind.RESOURCES;

  const filters = useMemo<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    if (tab === 'services') {
      const hasInternal = selectedTypes.has('Internal');
      const hasThirdParty = selectedTypes.has('Third Party');
      if (hasInternal && !hasThirdParty) f.isThirdParty = 'false';
      else if (hasThirdParty && !hasInternal) f.isThirdParty = 'true';
      if (selectedVisibility.size > 0 && selectedVisibility.size < SERVICE_VISIBILITY_FILTERS.length) f.networkVisibility = [...selectedVisibility].join(',');
    }
    if (tab === 'databases') {
      if (selectedStorageTypes.size > 0 && selectedStorageTypes.size < DB_STORAGE_TYPE_FILTERS.length) f.databaseTypes = [...selectedStorageTypes].join(',');
      if (selectedCloudProviders.size > 0 && selectedCloudProviders.size < DB_CLOUD_PROVIDER_FILTERS.length) f.cloudProviders = [...selectedCloudProviders].join(',');
    }
    if (tab === 'storage') f.resourceTypes = 'STORAGE';
    return f;
  }, [tab, selectedTypes, selectedVisibility, selectedStorageTypes, selectedCloudProviders]);

  const { data: catalog, isLoading: catalogLoading, isError: catalogError, refetch } = useConnectionCatalog(kind, projectId ?? '', { search, filters, limit: 100 });

  const displayItems = useMemo(() => {
    let items = catalog?.data ?? [];
    // A component can't connect to its own published service — exclude it at integration level.
    if (componentId) items = items.filter((item) => item.component?.componentId !== componentId);
    if (selectedCategories.size > 0) items = items.filter((item) => (item.categories ?? []).some((c) => selectedCategories.has(c)));
    return [...items].sort((a, b) => (sortBy === 'name-asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
  }, [catalog?.data, componentId, selectedCategories, sortBy]);

  const pageCount = Math.ceil(displayItems.length / RESOURCE_PAGE_SIZE);
  const pagedItems = useMemo(() => displayItems.slice((page - 1) * RESOURCE_PAGE_SIZE, page * RESOURCE_PAGE_SIZE), [displayItems, page]);

  useEffect(() => setPage(1), [tab, search, sortBy, selectedTypes, selectedVisibility, selectedStorageTypes, selectedCloudProviders, selectedCategories]);

  const label = RESOURCE_TAB_LABELS[tab];
  const showFilters = tab !== 'storage';

  return (
    <PageContent>
      <Button variant="text" startIcon={<ArrowLeft size={18} />} onClick={() => navigate(base)} sx={{ mb: 2 }}>
        Back to Connections
      </Button>

      <Typography variant="h1" sx={{ mb: 2.5, mt: 1 }}>
        Select a Resource
      </Typography>

      <Tabs
        value={tab}
        onChange={(_e, v) => {
          setTab(v as ResourceTab);
          setSelectedCategories(new Set());
        }}
        sx={{ mb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        {(Object.keys(RESOURCE_TAB_LABELS) as ResourceTab[]).map((t) => (
          <Tab key={t} value={t} label={RESOURCE_TAB_LABELS[t]} sx={{ textTransform: 'none', minHeight: 40 }} />
        ))}
      </Tabs>

      {projectLoading && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 6 }} />}
      {!projectLoading && !projectId && <Alert severity="error">Project not found.</Alert>}

      {!projectLoading && projectId && (
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'stretch', height: 'calc(100vh - 260px)' }}>
          {showFilters && (
            <Box sx={{ width: 240, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', pr: 2, overflowY: 'auto' }}>
              {tab === 'services' && (
                <>
                  <FilterSection title="Type" items={SERVICE_TYPE_FILTERS} selected={selectedTypes} onToggle={toggleInSet(setSelectedTypes)} />
                  <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 1 }} />
                  <FilterSection title="Network Visibility" items={SERVICE_VISIBILITY_FILTERS} selected={selectedVisibility} onToggle={toggleInSet(setSelectedVisibility)} />
                  <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 1 }} />
                </>
              )}
              {tab === 'databases' && (
                <>
                  <FilterSection title="Storage Types" items={DB_STORAGE_TYPE_FILTERS} selected={selectedStorageTypes} onToggle={toggleInSet(setSelectedStorageTypes)} />
                  <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 1 }} />
                  <FilterSection title="Cloud Providers" items={DB_CLOUD_PROVIDER_FILTERS} selected={selectedCloudProviders} onToggle={toggleInSet(setSelectedCloudProviders)} />
                  <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 1 }} />
                </>
              )}
              <FilterSection title="Categories" items={CATEGORY_FILTERS} selected={selectedCategories} onToggle={toggleInSet(setSelectedCategories)} />
            </Box>
          )}

          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Stack direction="row" gap={1.5} alignItems="center" sx={{ mb: 2.5, flexShrink: 0 }}>
              <TextField
                size="small"
                placeholder={`Search ${label.toLowerCase()}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flex: 1 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={16} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Select size="small" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} sx={{ minWidth: 140 }}>
                <MenuItem value="name-asc">Name (A → Z)</MenuItem>
                <MenuItem value="name-desc">Name (Z → A)</MenuItem>
              </Select>
            </Stack>

            <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
              {catalogLoading ? (
                <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 6 }} />
              ) : catalogError ? (
                <Alert
                  severity="error"
                  action={
                    <Button color="inherit" size="small" onClick={() => refetch()}>
                      Retry
                    </Button>
                  }>
                  Failed to load {label.toLowerCase()}.
                </Alert>
              ) : displayItems.length === 0 ? (
                <Stack alignItems="center" gap={2} sx={{ py: 6 }}>
                  <Alert severity="info">
                    No {label.toLowerCase()} found. Create a {label.toLowerCase()} before connecting.
                  </Alert>
                  {tab === 'databases' && (
                    <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => navigate(`/organizations/${org}/admin/databases`)}>
                      Create Database
                    </Button>
                  )}
                </Stack>
              ) : (
                <>
                  <Grid container spacing={2} sx={{ my: 2 }}>
                    {pagedItems.map((item) => (
                      <Grid key={item.serviceId ?? item.resourceId} size={{ xs: 12, sm: 6, md: 4 }}>
                        <ResourceCard item={item} onClick={() => onPick(item)} onDetail={() => setDetailItem(item)} />
                      </Grid>
                    ))}
                  </Grid>
                  {pageCount > 1 && (
                    <Stack alignItems="center" sx={{ mt: 3, pb: 1 }}>
                      <Pagination count={pageCount} page={page} onChange={(_e, v) => setPage(v)} size="small" shape="rounded" />
                    </Stack>
                  )}
                </>
              )}
            </Box>
          </Box>
        </Box>
      )}

      <ServiceDetailDrawer
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onSelect={(item) => {
          setDetailItem(null);
          onPick(item);
        }}
      />
    </PageContent>
  );
}
