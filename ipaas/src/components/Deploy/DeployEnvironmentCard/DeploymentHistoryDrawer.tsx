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

import { Box, CircularProgress, Divider, DrawerPanel, Stack, Typography, RelativeTime } from '@wso2/oxygen-ui';
import { CheckCircle2, Clock, GitCommitHorizontal, User, XCircle } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useReleaseMgtDeployments } from '../../../hooks/useDeployments';
import { formatDateTime, formatDistanceToNow } from '../../../utils/time';

// "0001-01-01T00:00:00Z" is the zero-value date the backend returns when not yet deployed
const isZeroDate = (d: string) => !d || d.startsWith('0001-01-01');

interface DeploymentHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  orgUuid: string;
  projectId: string;
  componentId: string;
  versionId: string;
  environmentId: string;
  envName: string;
}

export default function DeploymentHistoryDrawer({ open, onClose, orgUuid, projectId, componentId, versionId, environmentId, envName }: DeploymentHistoryDrawerProps): JSX.Element {
  const { data: deployments = [], isLoading } = useReleaseMgtDeployments(orgUuid, projectId, componentId, versionId, environmentId);

  return (
    <DrawerPanel open={open} onClose={onClose} width={480}>
      <DrawerPanel.Header>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <DrawerPanel.Title>Deployment History</DrawerPanel.Title>
          <Typography variant="caption" color="text.secondary">
            {envName}
          </Typography>
        </Stack>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body sx={{ p: 0 }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!isLoading && deployments.length === 0 && (
          <Box sx={{ px: 2.5, pt: 3 }}>
            <Typography variant="body2" color="text.secondary">
              No deployment history found for this environment.
            </Typography>
          </Box>
        )}

        {!isLoading &&
          deployments.map((dep, idx) => {
            const isSuccess = dep.status === 'SUCCESS';
            const isFailed = dep.status === 'FAILED';

            // deployedAt is a zero date when the deployment hasn't completed; fall back to createdAt
            const time = !isZeroDate(dep.deployedAt) ? dep.deployedAt : dep.createdAt;

            return (
              <Box key={dep.id ?? idx}>
                <Stack direction="row" gap={1.5} sx={{ px: 2.5, py: 2 }}>
                  {/* Status icon */}
                  <Box sx={{ pt: 0.25, flexShrink: 0 }}>{isSuccess ? <CheckCircle2 size={16} color="#36B475" /> : isFailed ? <XCircle size={16} color="#FD6B6B" /> : <Clock size={16} style={{ opacity: 0.5 }} />}</Box>

                  <Stack gap={0.5} sx={{ minWidth: 0 }}>
                    {/* Status + release name */}
                    <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                      <Typography variant="body2" fontWeight={600}>
                        {isSuccess ? 'Success' : isFailed ? 'Failed' : 'Pending'}
                      </Typography>
                      {dep.releaseName && (
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {dep.releaseName}
                        </Typography>
                      )}
                    </Stack>

                    {/* Time */}
                    {time && <RelativeTime time={formatDistanceToNow(time)} dateTime={time} tooltip={formatDateTime(time)} size="small" />}

                    {/* Commit hash */}
                    {dep.commitHash && (
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <GitCommitHorizontal size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {dep.commitHash.substring(0, 9)}
                        </Typography>
                      </Stack>
                    )}

                    {/* Comment */}
                    {dep.comment && (
                      <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dep.comment}
                      </Typography>
                    )}

                    {/* Deployed by */}
                    {dep.deployedBy && (
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <User size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                        <Typography variant="caption" color="text.secondary">
                          {dep.deployedBy}
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                </Stack>
                {idx < deployments.length - 1 && <Divider />}
              </Box>
            );
          })}
      </DrawerPanel.Body>
    </DrawerPanel>
  );
}
