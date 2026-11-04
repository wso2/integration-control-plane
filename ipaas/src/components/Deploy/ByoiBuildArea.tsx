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

import { Box, Button, Card, CardContent, Chip, CircularProgress, Divider, DrawerPanel, Stack, Typography, RelativeTime } from '@wso2/oxygen-ui';
import { Rocket } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import { useComponentDeployment, useByoiImageHistory } from '../../hooks/useDeployments';
import { useDeployByoiImage } from '../../hooks/useRagIngestion';
import type { ByoiImage } from '../../types/deployment';
import { formatDateTime, formatDistanceToNow } from '../../utils/time';

interface ByoiBuildAreaProps {
  componentId: string;
  versionId: string;
  orgHandler: string;
  orgUuid: string;
  projectId: string;
  firstEnvId: string;
}

/** Maps a registry host to a friendly provider label, mirroring Devant's registry naming. */
function registryLabel(host: string): string {
  if (host.includes('azurecr.io')) return 'Azure Container Registry';
  if (host.includes('amazonaws.com') || host.includes('.ecr.')) return 'Amazon Elastic Container Registry';
  if (host.includes('gcr.io') || host.includes('pkg.dev')) return 'Google Container Registry';
  if (host === 'docker.io' || host.endsWith('.docker.io') || host === 'registry-1.docker.io') return 'Docker Hub';
  if (host.includes('ghcr.io')) return 'GitHub Container Registry';
  return '';
}

/**
 * The Deploy-page "Set up" card for image-based (BYOI / RAG ingestion) components.
 * Mirrors Devant's BYOI Build Area: the source registry, a Deploy action for the
 * latest image, and the image history list (with a View More drawer).
 */
export default function ByoiBuildArea({ componentId, versionId, orgHandler, orgUuid, projectId, firstEnvId }: ByoiBuildAreaProps): JSX.Element {
  const { data: images, isLoading: imagesLoading } = useByoiImageHistory(orgUuid, projectId, componentId, versionId);
  const { data: firstEnvDeployment } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, firstEnvId);
  const deployImage = useDeployByoiImage();
  const [historyOpen, setHistoryOpen] = useState(false);

  const latestImage = images?.[0];
  const latestImageUrl = latestImage?.imageUrl ?? firstEnvDeployment?.imageUrl ?? '';
  const registryHost = latestImageUrl ? latestImageUrl.split('/')[0] : '';
  const registryName = registryHost ? registryLabel(registryHost) : '';
  const releaseId = firstEnvDeployment?.releaseId ?? '';
  const canDeploy = !!latestImageUrl && !!releaseId && !deployImage.isPending;

  const handleDeploy = () => {
    if (!canDeploy) return;
    deployImage.mutate({ componentId, releaseId, imageUrl: latestImageUrl });
  };

  return (
    <>
      <Card sx={{ width: 320, flexShrink: 0, position: 'sticky', top: 24, alignSelf: 'flex-start', background: 'transparent' }}>
        <CardContent>
          <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
            Set up
          </Typography>

          <Divider sx={{ mb: 2 }} />

          {/* ── Image source (registry) ── */}
          {imagesLoading && !registryHost ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, mb: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 2 }}>
              <Typography variant="body2">{registryHost ? `From ${registryHost}` : 'No image available yet.'}</Typography>
              {registryName && (
                <Typography variant="body2" color="text.secondary">
                  {registryName}
                </Typography>
              )}
            </Box>
          )}

          {/* ── Deploy the latest image ── */}
          <Button variant="contained" size="small" fullWidth startIcon={deployImage.isPending ? <CircularProgress color="inherit" size={14} /> : <Rocket size={14} />} disabled={!canDeploy} onClick={handleDeploy} sx={{ mb: 2 }}>
            {deployImage.isPending ? 'Deploying…' : 'Deploy'}
          </Button>

          <Divider sx={{ borderStyle: 'dashed', mb: 1.5 }} />

          {/* ── Image history ── */}
          <Typography variant="h5" sx={{ mb: 1 }}>
            Image history
          </Typography>

          {imagesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : images && images.length > 0 ? (
            <Stack divider={<Divider />}>
              {images.slice(0, 3).map((image) => (
                <ImageHistoryItem key={image.id} image={image} />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No images yet.
            </Typography>
          )}

          {images && images.length > 3 && (
            <Button variant="text" size="small" onClick={() => setHistoryOpen(true)} sx={{ mt: 1, px: 0 }}>
              View more
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Full image-history drawer */}
      <DrawerPanel open={historyOpen} onClose={() => setHistoryOpen(false)} width={440}>
        <DrawerPanel.Header>
          <DrawerPanel.Title>Image history</DrawerPanel.Title>
          <DrawerPanel.Actions>
            <DrawerPanel.CloseButton />
          </DrawerPanel.Actions>
        </DrawerPanel.Header>
        <DrawerPanel.Body sx={{ py: 1 }}>
          <Stack divider={<Divider />}>
            {images?.map((image) => (
              <ImageHistoryItem key={image.id} image={image} />
            ))}
          </Stack>
        </DrawerPanel.Body>
      </DrawerPanel>
    </>
  );
}

/** A single image-history row: image (name:tag without host), age, and trigger-source chip. */
function ImageHistoryItem({ image }: { image: ByoiImage }): JSX.Element {
  const host = image.imageUrl.split('/')[0];
  const imageDetails = image.imageUrl.replace(`${host}/`, '');
  const isManual = image.triggerSource === 'MANUAL';
  return (
    <Box sx={{ py: 1.5 }}>
      <Typography variant="body2" sx={{ mb: 0.75, wordBreak: 'break-all' }}>
        {imageDetails}
      </Typography>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <RelativeTime time={formatDistanceToNow(image.updatedAt)} dateTime={image.updatedAt} tooltip={formatDateTime(image.updatedAt)} />
        <Chip label={isManual ? 'Manual' : 'External CI'} size="small" variant="outlined" color={isManual ? 'info' : 'secondary'} sx={{ height: 20, fontSize: '0.7rem' }} />
      </Stack>
    </Box>
  );
}
