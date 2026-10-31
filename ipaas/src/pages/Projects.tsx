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

import { Alert, Box, Button, CircularProgress, Grid, IconButton, ListingCard, PageContent, PageTitle, TablePagination, Tooltip } from '@wso2/oxygen-ui';
import { Folder, FolderInput, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import SearchField from '../components/SearchField';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useState, type JSX } from 'react';
import { useProjects } from '../hooks/useProjects';
import { useComponents } from '../hooks/useComponents';
import DeleteProjectDialog from '../components/DeleteProjectDialog';
import { useRemovalNotice } from '../hooks/useRemovalNotice';
import type { Project } from '../types/project';
import EmptyListing from '../components/EmptyListing';
import { formatDateTime, formatDistanceToNow } from '../utils/time';
import { newProjectUrl, importProjectUrl, type OrgScope } from '../nav';
import { projectHomeUrl } from '../paths';
import { useAccessControl } from '../contexts/AccessControlContext';
import { Scopes } from '../constants/permissions';
import Authorized from '../components/Authorized';
import * as styles from './Projects.styles';

function ProjectCard({ org, project, canDelete, onClick, onDelete }: { org: string; project: Project; canDelete: boolean; onClick: () => void; onDelete: () => void }) {
  const deleting = project.deleting === true;
  // The delete action shows on hover or focus, so its integration count is fetched then rather than for every card.
  const [armed, setArmed] = useState(false);
  const { data: components, isError: componentsError } = useComponents(org, armed && canDelete && !deleting ? project.id : '');
  const hasComponents = !!components?.length;
  return (
    <Tooltip title={deleting ? 'This project is being deleted' : ''}>
      <ListingCard
        title={project.name}
        description={project.description?.trim() || undefined}
        updatedTime={deleting ? 'Deleting…' : formatDistanceToNow(project.updatedAt)}
        updatedDateTime={deleting ? undefined : project.updatedAt}
        updatedTooltip={deleting ? undefined : formatDateTime(project.updatedAt)}
        onClick={deleting ? undefined : onClick}
        aria-disabled={deleting || undefined}
        sx={deleting ? styles.cardDeleting : styles.card}
        onMouseEnter={() => setArmed(true)}
        onFocus={() => setArmed(true)}
        actions={
          deleting || !canDelete ? undefined : (
            <Tooltip title={componentsError ? 'Could not check this project for integrations. Try again later.' : hasComponents ? 'To remove a project, you must delete all integrations in it.' : 'Delete'}>
              {/* A disabled button fires no events, so the span carries the tooltip and stops the click opening the card. */}
              <span onClick={(e) => e.stopPropagation()}>
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`Delete ${project.name}`}
                  disabled={!components || hasComponents}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}>
                  <Trash2 size={16} />
                </IconButton>
              </span>
            </Tooltip>
          )
        }
      />
    </Tooltip>
  );
}

export default function Projects(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [alert, setAlert] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const { hasOrgPermission } = useAccessControl();
  const canCreateProject = hasOrgPermission(Scopes.PROJECT_CREATE);
  const canDeleteProject = hasOrgPermission(Scopes.PROJECT_DELETE);
  const { data: projects, isLoading } = useProjects();

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

  return (
    <PageContent fullWidth>
      <PageTitle>
        <PageTitle.Header>All projects</PageTitle.Header>
        <PageTitle.Actions>
          <Authorized permissions={Scopes.PROJECT_CREATE}>
            <Button variant="outlined" startIcon={<FolderInput size={16} />} onClick={() => navigate(importProjectUrl(scope))} sx={styles.projectActionSx}>
              Import project
            </Button>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => navigate(newProjectUrl(scope))} sx={styles.projectActionSx}>
              Create project
            </Button>
          </Authorized>
        </PageTitle.Actions>
      </PageTitle>

      <SearchField value={query} onChange={setQuery} placeholder="Search projects" width="standard" sx={styles.searchSx} />

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
          actionLabel="Create project"
          onAction={() => navigate(newProjectUrl(scope))}
        />
      ) : (
        <>
          <Grid container spacing={2}>
            {paginated.map((p) => (
              <Grid key={p.id} size={{ xs: 12, sm: 6, md: 3 }}>
                <ProjectCard org={scope.org} project={p} canDelete={canDeleteProject} onClick={() => navigate(projectHomeUrl(scope.org, p.handler))} onDelete={() => setDeletingProject(p)} />
              </Grid>
            ))}
          </Grid>
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

      {deletingProject && <DeleteProjectDialog project={deletingProject} onClose={() => setDeletingProject(null)} />}
    </PageContent>
  );
}
