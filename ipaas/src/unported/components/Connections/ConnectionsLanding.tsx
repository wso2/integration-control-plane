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

import { Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress, Grid, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useConnections } from '../../hooks/useConnections';
import { CONNECTION_IMAGES } from '../../constants/connections';
import ConnectionsListView from './ConnectionsListView';

const CONNECTION_TYPES: { image: string; label: string; description: string; tab: 'services' | 'databases' | 'storage' }[] = [
  { image: CONNECTION_IMAGES.service, label: 'Service', description: 'Create a connection to any service deployed in WSO2 Integration Platform.', tab: 'services' },
  { image: CONNECTION_IMAGES.database, label: 'Database', description: 'Create a connection to any database created in WSO2 Integration Platform.', tab: 'databases' },
  { image: CONNECTION_IMAGES.storage, label: 'Storage', description: 'Create a connection to a storage created in WSO2 Integration Platform.', tab: 'storage' },
];

interface ConnectionsLandingProps {
  projectId: string;
  /** Component-scoped listing when set; otherwise project-scoped. */
  componentId?: string;
  /** URL base for connection actions, e.g. `/organizations/x/projects/y/admin/connections`. */
  base: string;
}

/**
 * Shared Connections page body for both project and component (integration-level) scopes.
 * Shows the connections list when any exist, otherwise a create-a-connection landing.
 */
export default function ConnectionsLanding({ projectId, componentId, base }: ConnectionsLandingProps): JSX.Element {
  const navigate = useAppNavigate();
  const { data: connections, isLoading, isFetching, isError, refetch } = useConnections({ projectId, componentId });
  const goCreate = (tab?: 'services' | 'databases' | 'storage') => navigate(tab ? `${base}/new?tab=${tab}` : `${base}/new`);

  if (isError) {
    return (
      <PageContent>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load connections.
        </Alert>
      </PageContent>
    );
  }

  if (connections && connections.length > 0) {
    return (
      <PageContent>
        <ConnectionsListView key={componentId ?? projectId} projectId={projectId} componentId={componentId} base={base} />
      </PageContent>
    );
  }

  // Show the loader while loading OR while a refetch is in flight with no cached
  // rows yet — e.g. right after creating the first connection, when the stale
  // cache is empty. This prevents the empty landing from flashing before the
  // freshly-created connection arrives and the list renders.
  if ((isLoading || isFetching) && projectId) {
    return (
      <PageContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Connections</PageTitle.Header>
      </PageTitle>

      {/* Banner row — title + description left, illustration right */}
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="start" gap={5} sx={{ pb: 10 }}>
        <Stack gap={2} sx={{ maxWidth: 550, flexShrink: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Connect to services, databases and more
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create connections to securely consume in-platform services, third-party APIs, databases and storage from your integrations.
          </Typography>
        </Stack>
        <Box component="img" src={CONNECTION_IMAGES.banner} alt="Connections" sx={{ width: '100%', maxWidth: 620, height: 'auto' }} />
      </Stack>

      {/* Connection type cards */}
      <Grid container spacing={3}>
        {CONNECTION_TYPES.map(({ image, label, description, tab }) => (
          <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card variant="outlined" sx={{ height: '100%', borderRadius: 2, transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 4 } }}>
              <CardActionArea onClick={() => goCreate(tab)} sx={{ height: '100%', alignItems: 'flex-start' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2.5, p: 3 }}>
                  <Box component="img" src={image} alt={label} sx={{ width: 48, height: 48, flexShrink: 0, objectFit: 'contain' }} />
                  <Stack gap={0.5}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {description}
                    </Typography>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </PageContent>
  );
}
