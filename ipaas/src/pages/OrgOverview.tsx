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

import { Fragment, useEffect, useState, type JSX, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { Alert, Avatar, Box, Button, ButtonBase, Card, Divider, PageContent, RelativeTime, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, BookOpen, Box as BoxIcon, Database, Folder, Plus, Workflow } from '@wso2/oxygen-ui-icons-react';
import Authorized from '../components/Authorized';
import EmptyListing from '../components/EmptyListing';
import ExploreMore from '../components/ExploreMore';
import ProjectPickerDialog from '../components/OrgOverview/ProjectPickerDialog';
import { Scopes } from '../constants/permissions';
import { useAccessControl } from '../contexts/AccessControlContext';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useOrgComponents } from '../hooks/useComponents';
import { useDatabaseAvailability } from '../hooks/useDatabases';
import { useProjects } from '../hooks/useProjects';
import { newComponentUrl, newDatabaseUrl, newKnowledgeBaseUrl, newProjectUrl, type OrgScope } from '../nav';
import { orgProjectsUrl, projectHomeUrl } from '../paths';
import type { Project } from '../types/project';
import { formatDateTime, formatDistanceToNow } from '../utils/time';
import { trackEvent } from '../services/tracking/tracking';
import * as styles from './OrgOverview.styles';

const LIST_SIZE = 3;

interface SummaryCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
  /** Disables the action and explains why in its tooltip. */
  disabledReason?: string;
}

function SummaryCard({ icon, title, description, actionLabel, onAction, disabledReason }: SummaryCardProps): JSX.Element {
  const action = (
    <Button fullWidth disabled={!!disabledReason || !onAction} onClick={onAction} endIcon={<ArrowRight size={16} />} sx={styles.summaryAction}>
      {actionLabel}
    </Button>
  );
  return (
    <Card sx={styles.summaryCard}>
      <Box sx={styles.summaryBody}>
        <Box sx={styles.iconTile}>{icon}</Box>
        <Box>
          <Typography fontWeight={600} sx={styles.summaryTitle}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
      </Box>
      <Divider />
      {disabledReason ? (
        // A disabled button fires no mouse events, so the tooltip listens on a wrapper.
        <Tooltip title={disabledReason} placement="top">
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
      <Avatar variant="light" color="primary" aria-hidden="true" sx={styles.projectAvatar}>
        <BoxIcon size={20} />
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
          {integrations === undefined ? '' : integrations === 1 ? '1 integration' : `${integrations} integrations`}
        </Typography>
        <Box sx={styles.updatedColumn}>
          {project.deleting ? (
            <Typography variant="body2" noWrap>
              Deleting
            </Typography>
          ) : (
            <RelativeTime time={formatDistanceToNow(project.updatedAt)} dateTime={project.updatedAt} tooltip={formatDateTime(project.updatedAt)} />
          )}
        </Box>
      </Box>
    </ButtonBase>
  );
}

function RowsSkeleton(): JSX.Element {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Fragment key={i}>
          <Box sx={styles.listRow}>
            <Skeleton variant="circular" width={40} height={40} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="30%" />
              <Skeleton width="20%" />
            </Box>
            <Skeleton width={120} />
          </Box>
          <Divider />
        </Fragment>
      ))}
    </>
  );
}

export default function OrgOverview(scope: OrgScope): JSX.Element {
  const dbAvailability = useDatabaseAvailability();
  const databasesAvailable = dbAvailability.data?.available === true;
  const navigate = useAppNavigate();
  const [pickingProject, setPickingProject] = useState(false);
  const { displayName, username } = useAuth();
  const { hasOrgPermission } = useAccessControl();
  const databaseDeniedReason = !hasOrgPermission(Scopes.CONFIG_MANAGE) ? 'You do not have permission to create databases.' : dbAvailability.data && !databasesAvailable ? 'Platform services are not available in this environment.' : undefined;
  const knowledgeBaseDeniedReason = !hasOrgPermission(Scopes.CONFIG_MANAGE) ? 'You do not have permission to create knowledge bases.' : undefined;
  const { data: projects = [], isLoading, isError, refetch } = useProjects();
  // The BFF returns projects unordered, so the most recently updated are picked here.
  const listed = [...projects].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, LIST_SIZE);
  // Only the listed rows need counts; the BFF has no org-wide count, and listing every project would cost a call each.
  const { byProject } = useOrgComponents(
    scope.org,
    listed.map((p) => p.id),
  );

  useEffect(() => trackEvent('visit-home'), []);

  const firstName = (displayName || username).split(/[\s@]/)[0];
  const openProjects = projects.filter((p) => !p.deleting);
  // With no project yet the action creates one first, so it needs that permission instead.
  const createDeniedReason =
    openProjects.length === 0 ? (hasOrgPermission(Scopes.PROJECT_CREATE) ? undefined : 'You do not have permission to create projects.') : hasOrgPermission(Scopes.INTEGRATION_CREATE) ? undefined : 'You do not have permission to create integrations.';

  // Integrations live in a project, so the user picks one only when there is a choice to make.
  const createIntegration = () => {
    if (openProjects.length === 0) navigate(newProjectUrl(scope));
    else if (openProjects.length === 1) navigate(newComponentUrl({ org: scope.org, project: openProjects[0].handler }));
    else setPickingProject(true);
  };

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
          <Fragment key={p.id}>
            <ProjectRow project={p} integrations={byProject.get(p.id)?.length} onOpen={() => navigate(projectHomeUrl(scope.org, p.handler))} />
            <Divider />
          </Fragment>
        ))}
        <Box sx={styles.allProjectsRow}>
          <Button endIcon={<ArrowRight size={16} />} onClick={() => navigate(orgProjectsUrl(scope.org))} sx={styles.allProjectsLink}>
            {projects.length > LIST_SIZE ? 'More projects' : 'All projects'}
          </Button>
        </Box>
      </>
    );
  };

  return (
    <PageContent fullWidth>
      <Typography variant="h1" sx={styles.greeting}>
        Hello,{' '}
        <Box component="span" sx={{ color: 'primary.main' }}>
          {firstName}
        </Box>
      </Typography>
      <Typography color="text.secondary" sx={styles.intro}>
        Integrate your systems seamlessly, and run them all on one platform.
      </Typography>

      <Box sx={styles.summaryGrid}>
        <SummaryCard
          icon={<Workflow size={24} />}
          title="Integrations"
          description="Create integrations that orchestrate data and events across your systems."
          actionLabel="Create an integration"
          onAction={isLoading ? undefined : createIntegration}
          disabledReason={createDeniedReason}
        />
        <SummaryCard
          icon={<BookOpen size={24} />}
          title="Knowledge bases"
          description="Organize the content your agents and integrations draw on."
          actionLabel="Create a knowledge base"
          onAction={() => navigate(newKnowledgeBaseUrl(scope))}
          disabledReason={knowledgeBaseDeniedReason}
        />
        <SummaryCard
          icon={<Database size={24} />}
          title="Databases"
          description="Provision managed databases for your integrations to store and query data."
          actionLabel="Create a database"
          onAction={databasesAvailable ? () => navigate(newDatabaseUrl(scope, 'postgres')) : undefined}
          disabledReason={databaseDeniedReason}
        />
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
          <Authorized permissions={Scopes.PROJECT_CREATE}>
            <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => navigate(newProjectUrl(scope))} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              Create project
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
