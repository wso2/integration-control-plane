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

import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { Alert, Avatar, Box, Button, ButtonBase, Card, Divider, PageContent, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, BookOpen, Clock, Database, Folder, Plus, Workflow } from '@wso2/oxygen-ui-icons-react';
import Authorized from '../components/Authorized';
import EmptyListing from '../components/EmptyListing';
import ExploreMore from '../components/ExploreMore';
import ProjectPickerDialog from '../components/OrgOverview/ProjectPickerDialog';
import { Permissions } from '../constants/permissions';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useOrgComponents } from '../hooks/useComponents';
import { useProjects } from '../hooks/useProjects';
import { newComponentUrl, newProjectUrl, type OrgScope } from '../nav';
import { orgProjectsUrl, projectHomeUrl } from '../paths';
import type { Project } from '../types/project';
import { formatDistanceToNow } from '../utils/time';
import { trackEvent } from '../services/tracking/tracking';
import * as styles from './OrgOverview.styles';

const LIST_SIZE = 3;

interface SummaryCardProps {
  icon: ReactNode;
  title: string;
  /** Omitted while the count is loading or has no backend to come from. */
  count?: number;
  description: string;
  actionLabel: string;
  onAction?: () => void;
  /** Shows the action disabled, with a "Coming soon" tooltip. */
  comingSoon?: boolean;
}

function SummaryCard({ icon, title, count, description, actionLabel, onAction, comingSoon }: SummaryCardProps): JSX.Element {
  const action = (
    <Button fullWidth disabled={comingSoon || !onAction} onClick={onAction} endIcon={<ArrowRight size={16} />} sx={styles.summaryAction}>
      {actionLabel}
    </Button>
  );
  return (
    <Card sx={styles.summaryCard}>
      <Box sx={styles.summaryBody}>
        <Box sx={styles.iconTile}>{icon}</Box>
        <Box>
          <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography fontWeight={600} sx={styles.summaryTitle}>
              {title}
            </Typography>
            {count !== undefined && (
              <Typography variant="body2" color="text.secondary" sx={styles.countDivider}>
                {count}
              </Typography>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
      </Box>
      <Divider />
      {comingSoon ? (
        // A disabled button fires no mouse events, so the tooltip listens on a wrapper.
        <Tooltip title="Coming soon" placement="top">
          <Box component="span">{action}</Box>
        </Tooltip>
      ) : (
        action
      )}
    </Card>
  );
}

function ProjectRow({ project, integrations, onOpen }: { project: Project; integrations?: number; onOpen: () => void }): JSX.Element {
  return (
    <ButtonBase onClick={onOpen} disabled={project.deleting} sx={{ ...styles.listRow, opacity: project.deleting ? 0.38 : 1 }}>
      <Avatar variant="rounded" sx={styles.projectAvatar}>
        {project.name[0].toUpperCase()}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {project.name}
        </Typography>
        {project.description && (
          <Typography variant="caption" color="text.secondary" noWrap component="p">
            {project.description}
          </Typography>
        )}
      </Box>
      <Box sx={styles.rowMeta}>
        <Typography variant="body2" noWrap sx={styles.integrationsColumn}>
          {integrations === undefined ? '' : integrations === 1 ? '1 Integration' : `${integrations} Integrations`}
        </Typography>
        <Stack direction="row" alignItems="center" gap={0.75} sx={styles.updatedColumn}>
          <Clock size={14} />
          <Typography variant="body2" noWrap>
            {project.deleting ? 'Deleting' : formatDistanceToNow(project.updatedAt)}
          </Typography>
        </Stack>
      </Box>
    </ButtonBase>
  );
}

function RowsSkeleton(): JSX.Element {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={styles.listRow}>
          <Skeleton variant="rounded" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="30%" />
            <Skeleton width="20%" />
          </Box>
          <Skeleton width={120} />
        </Box>
      ))}
    </>
  );
}

export default function OrgOverview(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const [pickingProject, setPickingProject] = useState(false);
  const { displayName, username } = useAuth();
  const { data: projects = [], isLoading, isError, refetch } = useProjects();
  const { byProject, isLoading: loadingIntegrations } = useOrgComponents(
    scope.org,
    projects.map((p) => p.id),
  );

  useEffect(() => trackEvent('visit-home'), []);

  const firstName = (displayName || username).split(/[\s@]/)[0];
  const openProjects = projects.filter((p) => !p.deleting);
  const integrationCount = loadingIntegrations ? undefined : [...byProject.values()].reduce((sum, list) => sum + (list?.length ?? 0), 0);

  // Integrations live in a project, so the user picks one only when there is a choice to make.
  const createIntegration = () => {
    if (openProjects.length === 0) navigate(newProjectUrl(scope));
    else if (openProjects.length === 1) navigate(newComponentUrl({ org: scope.org, project: openProjects[0].handler }));
    else setPickingProject(true);
  };

  const listed = projects.slice(0, LIST_SIZE);

  const renderProjects = (): ReactNode => {
    if (isLoading) return <RowsSkeleton />;
    if (isError)
      return (
        <Alert severity="error" sx={{ m: 2.5 }} action={<Button onClick={() => refetch()}>Retry</Button>}>
          Could not load the projects.
        </Alert>
      );
    if (projects.length === 0) return <EmptyListing icon={<Folder size={48} />} title="No projects yet" description="Create a project to start building integrations." />;
    return (
      <>
        {listed.map((p) => (
          <ProjectRow key={p.id} project={p} integrations={byProject.get(p.id)?.length} onOpen={() => navigate(projectHomeUrl(scope.org, p.handler))} />
        ))}
        <Box sx={styles.allProjectsRow}>
          <Button endIcon={<ArrowRight size={16} />} onClick={() => navigate(orgProjectsUrl(scope.org))} sx={styles.allProjectsLink}>
            {projects.length > LIST_SIZE ? 'More Projects' : 'All Projects'}
          </Button>
        </Box>
      </>
    );
  };

  return (
    <PageContent>
      <Typography variant="h3" sx={styles.greeting}>
        Hello,{' '}
        <Box component="span" sx={{ color: 'primary.main' }}>
          {firstName}
        </Box>
      </Typography>
      <Typography color="text.secondary" sx={styles.intro}>
        Connect your systems, automate workflows, and build AI-powered integrations, then deploy and run them on one platform.
      </Typography>

      <Box sx={styles.summaryGrid}>
        <SummaryCard
          icon={<Workflow size={24} />}
          title="Integrations"
          count={integrationCount}
          description="Connect applications, data, and services through APIs, automations, and event-driven flows."
          actionLabel="Create an Integration"
          onAction={isLoading ? undefined : createIntegration}
        />
        <SummaryCard icon={<BookOpen size={24} />} title="Knowledge Bases" description="Organize the content your agents and integrations draw on." actionLabel="Create a Knowledge Base" comingSoon />
        <SummaryCard icon={<Database size={24} />} title="Databases" description="Provision managed databases for your integrations to store and query data." actionLabel="Create a Database" comingSoon />
      </Box>

        <Card>
          <Box sx={styles.sectionHeader}>
            <Stack direction="row" alignItems="center">
              <Typography variant="subtitle1" fontWeight={600}>
                Projects
              </Typography>
              {!isLoading && !isError && (
                <Typography variant="body2" color="text.secondary" sx={styles.countDivider}>
                  {projects.length}
                </Typography>
              )}
            </Stack>
            <Box sx={{ flex: 1 }} />
            <Authorized permissions={Permissions.PROJECT_MANAGE}>
              <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => navigate(newProjectUrl(scope))} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                Create Project
              </Button>
            </Authorized>
          </Box>
          <Divider />
          {renderProjects()}
        </Card>

      <ExploreMore />

      <ProjectPickerDialog open={pickingProject} projects={openProjects} onClose={() => setPickingProject(false)} onSelect={(project) => navigate(newComponentUrl({ org: scope.org, project: project.handler }))} />
    </PageContent>
  );
}
