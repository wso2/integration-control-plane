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

import { Alert, Button, DrawerPanel, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useComponentByHandler } from '../../../hooks/useComponents';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import { useScope } from '../../../nav';
import type { Environment } from '../../../types/environment';
import IntegrationLogs from '../../Logs/IntegrationLogs';

interface ServiceLogsDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  componentHandler: string;
  env: Environment;
  versionId: string;
  region?: string;
}

const toolbarSx = { px: 2, pt: 2, flexShrink: 0 } as const;

/** One deployment's runtime logs, in the same toolbar and viewer as the Runtime Logs page. */
export default function ServiceLogsDrawer({ open, onClose, projectId, componentHandler, env, versionId, region }: ServiceLogsDrawerProps): JSX.Element {
  const { org } = useScope();
  const orgUuid = useOrgUuid();
  const { data: component, isError, refetch } = useComponentByHandler(open ? projectId : '', componentHandler);

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  return (
    <DrawerPanel open={open} onClose={handleClose} width={720}>
      <DrawerPanel.Header>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <DrawerPanel.Title>Runtime logs</DrawerPanel.Title>
          <Typography variant="caption" color="text.secondary">
            {env.name}
          </Typography>
        </Stack>
        <DrawerPanel.Actions>
          <DrawerPanel.ExpandButton />
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      {isError ? (
        <DrawerPanel.Body>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }>
            Could not load this integration's logs.
          </Alert>
        </DrawerPanel.Body>
      ) : open && component && orgUuid ? (
        <IntegrationLogs orgHandler={org} orgUuid={orgUuid} component={component} environments={[env]} region={region} versionIds={versionId ? [versionId] : []}>
          {({ toolbar, viewer }) => (
            <>
              <Stack sx={toolbarSx}>{toolbar}</Stack>
              <DrawerPanel.Body>{viewer}</DrawerPanel.Body>
            </>
          )}
        </IntegrationLogs>
      ) : (
        <DrawerPanel.Body>
          <Stack gap={1.5} aria-busy="true" aria-label="Loading logs">
            <Skeleton variant="rounded" height={40} />
            <Skeleton variant="rounded" height={320} />
          </Stack>
        </DrawerPanel.Body>
      )}
    </DrawerPanel>
  );
}
