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

import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Divider, Grid, IconButton, Menu, MenuItem, PageContent, PageTitle, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Filter, LayoutGrid, List, Lock, PlugZap, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useTranslation } from '../i18n';
import { useNavigate } from 'react-router';
import { useAuth, VIEW_SCOPES } from '../auth';
import EmptyListing from '../components/EmptyListing';
import IntegrationCard from '../components/integrations/IntegrationCard';
import IntegrationsTable from '../components/integrations/IntegrationsTable';
import SearchField from '../components/SearchField';
import { useAllIntegrations, useDebounced, useIntegrationPages, useProjects } from '../hooks/useIntegrations';
import { useWorkItems } from '../hooks/useTasks';
import { integrationUrl } from '../paths';
import type { Integration, IntegrationKind } from '../types/portal';

const VIEW_KEY = 'user-portal:listing-view';
const PAGE_SIZE = 24;
// UP-DP refuses a longer search.
const MAX_SEARCH_LENGTH = 100;

type View = 'grid' | 'list';

function storedView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function CardsSkeleton({ count = 6 }: { count?: number }) {
  const { t } = useTranslation();
  return (
    <Grid container spacing={2} aria-busy="true" aria-label={t('integrations.listing.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <Grid key={i} size={{ xs: 12, sm: 6, lg: 4 }}>
          <Skeleton variant="rounded" height={168} />
        </Grid>
      ))}
    </Grid>
  );
}

/** The integrations of one kind, a page at a time, searched and filtered on the server. */
export default function IntegrationsPage({ kind }: { kind: IntegrationKind }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasScope } = useAuth();
  const allowed = hasScope(VIEW_SCOPES[kind]);
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim());
  const [projects, setProjects] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { data: projectList = [] } = useProjects();
  const { data, isLoading, isError, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useIntegrationPages({ kind, projects, search, limit: PAGE_SIZE }, allowed);
  const { data: workflows = [] } = useAllIntegrations('workflow', hasScope(VIEW_SCOPES.workflow));
  const { items: waiting } = useWorkItems(workflows);
  const [view, setView] = useState<View>(storedView);

  const shown = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.totalCount ?? 0;
  const waitingOn = (id: string) => waiting.filter((w) => w.integration.id === id).length;
  const open = (i: Integration) => navigate(integrationUrl(i.id));

  const projectLabel = (id: string) => projectList.find((p) => p.id === id)?.name ?? id;
  const toggleProject = (id: string) => setProjects((list) => (list.includes(id) ? list.filter((p) => p !== id) : [...list, id]));
  const clear = () => {
    setQuery('');
    setProjects([]);
  };

  const changeView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage may be blocked; the view then lasts for this visit.
    }
  };

  if (!allowed)
    return (
      <PageContent>
        <EmptyListing icon={<Lock size={48} />} title={t(`integrations.listing.${kind}.noAccess`)} description={t('integrations.listing.askForAccess')} />
      </PageContent>
    );

  let body;
  if (isLoading) body = <CardsSkeleton />;
  else if (isError)
    body = (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void refetch()}>{t('common.actions.retry')}</Button>}>
        {t(`integrations.listing.${kind}.loadError`)}
      </Alert>
    );
  else if (shown.length === 0)
    body =
      search || projects.length ? (
        <EmptyListing icon={<PlugZap size={48} />} title={t(`integrations.listing.${kind}.noMatch`)} description={t('integrations.listing.noMatchDescription')} actionLabel={t('integrations.listing.clearSearchAndFilters')} onAction={clear} />
      ) : (
        <EmptyListing icon={<PlugZap size={48} />} title={t(`integrations.listing.${kind}.empty`)} description={t('integrations.listing.emptyDescription')} />
      );
  else
    body =
      view === 'list' ? (
        <IntegrationsTable integrations={shown} waiting={waitingOn} onOpen={open} />
      ) : (
        <Grid container spacing={2}>
          {shown.map((i) => (
            <Grid key={i.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <IntegrationCard integration={i} waiting={waitingOn(i.id)} onOpen={() => open(i)} />
            </Grid>
          ))}
        </Grid>
      );

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>
          <Stack direction="row" alignItems="center" gap={1}>
            {t(`integrations.listing.${kind}.title`)}
            <IconButton size="small" aria-label={t('common.actions.refresh')} onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw size={18} style={{ animation: isFetching && !isLoading ? 'spin 1s linear infinite' : undefined }} />
            </IconButton>
          </Stack>
        </PageTitle.Header>
        <PageTitle.SubHeader>{t(`integrations.listing.${kind}.subheader`)}</PageTitle.SubHeader>
        <PageTitle.Actions>
          <ToggleButtonGroup value={view} exclusive onChange={(_, v: View | null) => v && changeView(v)} size="small">
            <ToggleButton value="grid" aria-label={t('integrations.listing.gridView')}>
              <LayoutGrid size={18} />
            </ToggleButton>
            <ToggleButton value="list" aria-label={t('integrations.listing.listView')}>
              <List size={18} />
            </ToggleButton>
          </ToggleButtonGroup>
        </PageTitle.Actions>
      </PageTitle>

      <Stack direction="row" alignItems="center" sx={{ mb: 3 }}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t(`integrations.listing.${kind}.search`)}
          fullWidth
          maxLength={MAX_SEARCH_LENGTH}
          end={
            projectList.length > 1 && (
              <Stack direction="row" alignItems="center" gap={0.5}>
                {projects.map((p) => (
                  <Chip key={p} size="small" label={projectLabel(p)} onDelete={() => toggleProject(p)} />
                ))}
                <Tooltip title={t('integrations.listing.filterByProject')}>
                  <IconButton size="small" edge="end" aria-label={t('integrations.listing.filterByProject')} color={projects.length ? 'primary' : undefined} onClick={(e) => setAnchor(e.currentTarget)}>
                    <Filter size={16} />
                  </IconButton>
                </Tooltip>
              </Stack>
            )
          }
        />
      </Stack>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 200 } } }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1, pb: 0.5 }}>
          {t('integrations.listing.project')}
        </Typography>
        {projectList.map((p) => (
          <MenuItem key={p.id} dense onClick={() => toggleProject(p.id)}>
            <Checkbox size="small" checked={projects.includes(p.id)} sx={{ p: 0, mr: 1 }} />
            {p.name}
          </MenuItem>
        ))}
        {projects.length > 0 && <Divider />}
        {projects.length > 0 && (
          <MenuItem dense onClick={() => setProjects([])}>
            <Typography variant="body2" color="error">
              {t('integrations.listing.clearFilter')}
            </Typography>
          </MenuItem>
        )}
      </Menu>

      {body}

      {!isLoading && !isError && hasNextPage && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Button variant="outlined" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} startIcon={isFetchingNextPage ? <CircularProgress size={16} /> : undefined}>
            {t('integrations.listing.showMore', { shown: shown.length, total })}
          </Button>
        </Box>
      )}
    </PageContent>
  );
}
