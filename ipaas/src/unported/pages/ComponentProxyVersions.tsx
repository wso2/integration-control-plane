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

import { Alert, Box, Chip, CircularProgress, ListingTable, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import { GitMerge } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import Authorized from '../../components/Authorized';
import EmptyListing from '../../components/EmptyListing';
import ComponentSettingsTabs from '../components/Settings/ComponentSettingsTabs';
import TrackDeleteButton from '../components/Settings/TrackDeleteButton';
import { Permissions } from '../../constants/permissions';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useProjectId } from '../../hooks/useProjects';
import type { ApiVersion } from '../../types/component';
import type { ComponentScope } from '../../nav';

function VersionsBody({ orgHandler, projectId, componentId, versions }: { orgHandler: string; projectId: string; componentId: string; versions: ApiVersion[] }): JSX.Element {
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const onlyVersion = versions.length <= 1;
  const showBranch = versions.some((v) => v.branch);

  if (versions.length === 0) {
    return <EmptyListing icon={<GitMerge size={48} />} title="No versions" description="This proxy has no versions yet." />;
  }

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}
      <ListingTable.Container>
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              {showBranch && <ListingTable.Cell>Branch</ListingTable.Cell>}
              <ListingTable.Cell>API Version</ListingTable.Cell>
              <ListingTable.Cell align="right">Actions</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {versions.map((v) => (
              <ListingTable.Row key={v.id}>
                {showBranch && <ListingTable.Cell>{v.branch || '—'}</ListingTable.Cell>}
                <ListingTable.Cell>
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    {v.apiVersion}
                    {v.latest && <Chip label="Latest" size="small" variant="outlined" color="primary" />}
                  </Stack>
                </ListingTable.Cell>
                <ListingTable.Cell align="right">
                  <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                    <TrackDeleteButton
                      orgHandler={orgHandler}
                      projectId={projectId}
                      componentId={componentId}
                      trackId={v.id}
                      label={v.apiVersion}
                      disabled={onlyVersion}
                      disabledTooltip="Cannot delete the last version"
                      confirmTitle={`Delete version ‘${v.apiVersion}’?`}
                      confirmBody="This action is irreversible. All associated deployments will be lost, and current consumers of this version may break."
                      onResult={setAlert}
                    />
                  </Authorized>
                </ListingTable.Cell>
              </ListingTable.Row>
            ))}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
    </>
  );
}

export default function ComponentProxyVersions({ org, project, component }: ComponentScope): JSX.Element {
  const { projectId } = useProjectId(project);
  const { data: comp, isLoading } = useComponentByHandler(projectId, component);

  return (
    <PageContent>
      <ComponentSettingsTabs active="proxy-versions" />
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !comp ? (
        <Typography>Integration not found</Typography>
      ) : (
        <VersionsBody orgHandler={org} projectId={projectId} componentId={comp.id} versions={comp.apiVersions ?? []} />
      )}
    </PageContent>
  );
}
