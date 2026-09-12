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

import { Alert, Avatar, Box, Button, Card, CardContent, CircularProgress, Grid, IconButton, ListingTable, PageContent, PageTitle, Stack, TablePagination, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Clock, Folder, FolderInput, LayoutGrid, List, Plus, RefreshCw, Settings } from '@wso2/oxygen-ui-icons-react';
import SearchField from '../components/SearchField';
import { useLocation } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useEffect, useState, type JSX } from 'react';
import { useProjectsByOrg } from '../hooks/useProjects';
import { useRemovalNotice } from '../hooks/useRemovalNotice';
import type { Project } from '../types/project';
import EmptyListing from '../components/EmptyListing';
import { formatDistanceToNow } from '../utils/time';
import ExploreMore from '../components/ExploreMore';
import { newProjectUrl, importProjectUrl, projectSettingsSectionUrl, type OrgScope } from '../nav';
import { projectHomeUrl } from '../paths';
import { useAccessControl } from '../contexts/AccessControlContext';
import { Permissions } from '../constants/permissions';
import Authorized from '../components/Authorized';
import * as styles from './Projects.styles';

function ProjectCard({ project, onClick, onSettingsClick }: { project: Project; onClick: () => void; onSettingsClick: () => void }) {
  const deleting = project.deleting === true;
  return (
    <Tooltip title={deleting ? 'This project is being deleted' : ''}>
      <Card variant="outlined" aria-disabled={deleting || undefined} sx={deleting ? styles.cardDeleting : styles.card} onClick={deleting ? undefined : onClick}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2.5 }}>
          <Avatar variant="rounded" sx={{ bgcolor: 'action.hover', color: 'text.secondary', width: 48, height: 48, borderRadius: 1 }}>
            {project.name[0].toUpperCase()}
          </Avatar>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
            {project.name}
          </Typography>
        </CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, pb: 2 }}>
          {deleting ? (
            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
              <CircularProgress size={12} color="inherit" />
              Deleting
            </Typography>
          ) : (
            <>
              <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                <Clock size={14} />
                {formatDistanceToNow(project.updatedAt)}
              </Typography>
              <IconButton
                size="small"
                aria-label={`Settings for ${project.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSettingsClick();
                }}>
                <Settings size={16} />
              </IconButton>
            </>
          )}
        </Stack>
      </Card>
    </Tooltip>
  );
}

export default function Projects(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [alert, setAlert] = useState<string | null>(null);
  const { hasOrgPermission } = useAccessControl();
  const canCreateProject = hasOrgPermission(Permissions.PROJECT_MANAGE);
  const { data: projects, isLoading, refetch } = useProjectsByOrg(scope.org);

  useEffect(() => {
    const state = location.state as { projectDeleted?: boolean } | null;
    if (state?.projectDeleted) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  useRemovalNotice(
    scope.org,
    projects,
    (p) => p.name,
    (name) => setAlert(`Project '${name}' deleted successfully.`),
  );

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  const filtered = (projects ?? []).filter((p) => {
    if (!query) return true;
    const searchQuery = query.trim().toLowerCase();
    return p.name.toLowerCase().includes(searchQuery) || p.description?.toLowerCase().includes(searchQuery) || p.handler.toLowerCase().includes(searchQuery) || p.region?.toLowerCase().includes(searchQuery) || p.type?.toLowerCase().includes(searchQuery);
  });
  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1);
  const safePage = Math.min(page, maxPage);
  const paginated = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  const projectsView =
    view === 'list' ? (
      <ListingTable.Container disablePaper>
        <ListingTable variant="card" density="compact" sx={{ '& .MuiTableBody-root .MuiTableCell-root': { py: 2 } }}>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell width={300}>Name</ListingTable.Cell>
              <ListingTable.Cell>Description</ListingTable.Cell>
              <ListingTable.Cell>Last Updated</ListingTable.Cell>
              <ListingTable.Cell width={100}>Actions</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {paginated.map((p) => {
              const deleting = p.deleting === true;
              return (
                // followCursor because ListingTable.Row does not forward a ref for the tooltip to anchor to.
                <Tooltip key={p.id} followCursor title={deleting ? 'This project is being deleted' : ''}>
                  <ListingTable.Row
                    variant="card"
                    hover={!deleting}
                    clickable={!deleting}
                    aria-disabled={deleting || undefined}
                    // The card variant tints its own background on hover; pin both states so a dying row stays inert.
                    sx={deleting ? { opacity: 0.38, cursor: 'default', backgroundColor: 'background.acrylic', '&:hover': { backgroundColor: 'background.acrylic' } } : undefined}
                    onClick={deleting ? undefined : () => navigate(projectHomeUrl(scope.org, p.handler))}>
                    <ListingTable.Cell>
                      <Stack direction="row" alignItems="center" gap={1.5}>
                        <Avatar variant="rounded" sx={{ width: 32, height: 32, borderRadius: 1, fontSize: 14, bgcolor: 'action.hover', color: 'text.primary' }}>
                          {p.name[0].toUpperCase()}
                        </Avatar>
                        <Typography variant="body2" fontWeight={600}>
                          {p.name}
                        </Typography>
                      </Stack>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                        {p.description || ''}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      {!deleting && (
                        <Typography variant="body2" color="text.secondary">
                          {formatDistanceToNow(p.updatedAt)}
                        </Typography>
                      )}
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      {deleting ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <CircularProgress size={12} color="inherit" />
                          <Typography variant="caption" color="text.secondary" noWrap>
                            Deleting
                          </Typography>
                        </Box>
                      ) : (
                        <IconButton
                          size="small"
                          aria-label={`Settings for ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(projectSettingsSectionUrl({ org: scope.org, project: p.handler }, 'project-overview'));
                          }}>
                          <Settings size={16} />
                        </IconButton>
                      )}
                    </ListingTable.Cell>
                  </ListingTable.Row>
                </Tooltip>
              );
            })}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
    ) : (
      <Grid container spacing={2}>
        {paginated.map((p) => (
          <Grid key={p.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <ProjectCard project={p} onClick={() => navigate(projectHomeUrl(scope.org, p.handler))} onSettingsClick={() => navigate(projectSettingsSectionUrl({ org: scope.org, project: p.handler }, 'project-overview'))} />
          </Grid>
        ))}
      </Grid>
    );

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>
          <Stack direction="row" alignItems="center" gap={1}>
            All Projects
            <IconButton size="small" aria-label="Refresh projects" onClick={() => refetch()}>
              <RefreshCw size={18} />
            </IconButton>
          </Stack>
        </PageTitle.Header>
        <PageTitle.Actions>
          <ToggleButtonGroup value={view} exclusive onChange={(_, v) => v && setView(v)} size="small">
            <ToggleButton value="grid" aria-label="Grid view">
              <LayoutGrid size={18} />
            </ToggleButton>
            <ToggleButton value="list" aria-label="List view">
              <List size={18} />
            </ToggleButton>
          </ToggleButtonGroup>
        </PageTitle.Actions>
      </PageTitle>

      <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 3, ml: 1 }}>
        <SearchField value={query} onChange={setQuery} placeholder="Search projects" fullWidth />
        <Authorized permissions={Permissions.PROJECT_MANAGE}>
          <Button variant="contained" startIcon={<Plus size={20} />} onClick={() => navigate(newProjectUrl(scope))} sx={{ whiteSpace: 'nowrap' }}>
            Create
          </Button>
          <Button variant="outlined" startIcon={<FolderInput size={16} />} onClick={() => navigate(importProjectUrl(scope))} sx={{ whiteSpace: 'nowrap', pl: 3 }}>
            Import
          </Button>
        </Authorized>
      </Stack>

      {alert && (
        <Alert severity="success" onClose={() => setAlert(null)} sx={{ mb: 3 }}>
          {alert}
        </Alert>
      )}

      {filtered.length === 0 ? (
        <EmptyListing
          icon={<Folder size={48} />}
          title="No projects found"
          description={query ? 'Try adjusting your search' : canCreateProject ? 'Create your first project to get started' : 'Ask your administrator for access'}
          showAction={!query && canCreateProject}
          actionLabel="Create Project"
          onAction={() => navigate(newProjectUrl(scope))}
        />
      ) : (
        <>
          {projectsView}
          {filtered.length > 10 && (
            <TablePagination
              component="div"
              count={filtered.length}
              page={safePage}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 20, 50]}
              sx={{ mt: 2 }}
            />
          )}
        </>
      )}

      <ExploreMore />
    </PageContent>
  );
}
