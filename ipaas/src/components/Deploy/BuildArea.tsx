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

import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grow,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Skeleton,
  Stack,
  Switch,
  Typography,
} from '@wso2/oxygen-ui';
import { ChevronDown, Rocket, Settings } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDeployDeploymentTrack } from '../../hooks/useDeployments';
import { useWorkflowRuntime } from '../../hooks/useWorkflowRuntime';
import { useUpdateAutoDeployEnabled } from '../../hooks/useComponents';
import { useComponentDeployment, useDeploymentStatus, useDeploymentTrackImages } from '../../hooks/useDeployments';
import type { DeploymentTrackImage } from '../../types/deployment';
import ConfigureDrawer from '../EnvironmentCard/ConfigureDrawer';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import BuildAreaImageDrawer from './BuildAreaImageDrawer';
import BuildImageCard from './BuildImageCard';
import ByoiBuildArea from './ByoiBuildArea';
import EndpointConfigDrawer from './EndpointConfigDrawer';
import type { BuildAreaProps } from '../../types/deploy';

export default function BuildArea({
  componentId,
  versionId,
  orgHandler,
  orgUuid,
  projectId,
  deploymentPipelineId,
  flags,
  branch,
  commits,
  firstEnvId,
  firstEnvTemplateId,
  autoDeployEnabled: initialAutoDeployEnabled,
  autoDeployAvailable,
  componentName,
  projectHandler,
  displayType,
  hideEndpoints = false,
  isWorkflow = false,
  isMcpServer = false,
}: BuildAreaProps): JSX.Element {
  // Determine build-in-progress state first so images can poll faster during active builds
  const { data: builds = [] } = useDeploymentStatus(componentId, versionId);
  // Queued still blocks a deploy — the image it will produce does not exist yet.
  const pendingBuild = builds.find((b) => b.status === 'in_progress' || b.status === 'queued') ?? null;
  const isBuildPending = !!pendingBuild;
  const isBuildRunning = pendingBuild?.status === 'in_progress';
  const buildingCommit = pendingBuild ? (commits.find((c) => c.sha === pendingBuild.sha) ?? null) : null;

  const { data: images = [], isLoading: imagesLoading, isSuccess: imagesLoaded, isError: imagesFailed, refetch: refetchImages } = useDeploymentTrackImages(componentId, versionId, isBuildPending ? 10_000 : undefined);
  const { data: firstEnvDeployment } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, firstEnvId);
  const firstEnvReleaseId = firstEnvDeployment?.releaseId ?? '';

  const [selectedImage, setSelectedImage] = useState<DeploymentTrackImage | null>(null);
  const [imageDrawerOpen, setImageDrawerOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [endpointConfigOpen, setEndpointConfigOpen] = useState(false);
  const [deployConfirmOpen, setDeployConfirmOpen] = useState(false);
  const [autoDeployEnabled, setAutoDeployEnabled] = useState(initialAutoDeployEnabled ?? false);
  const [selectedDeployAction, setSelectedDeployAction] = useState<'deploy' | 'configure'>('deploy');
  // True from build completion until the post-build image refetch settles
  const [isPostBuildFetching, setIsPostBuildFetching] = useState(false);

  const splitButtonRef = useRef<HTMLDivElement>(null);
  const prevIsBuildPendingRef = useRef(isBuildPending);

  const qc = useQueryClient();
  const deployTrack = useDeployDeploymentTrack();
  const updateAutoDeploy = useUpdateAutoDeployEnabled();
  const can = useCan();

  // When build completes, trigger an immediate image refetch and show skeleton while it loads
  useEffect(() => {
    if (prevIsBuildPendingRef.current && !isBuildPending) {
      setIsPostBuildFetching(true);
      qc.refetchQueries({ queryKey: ['deploymentTrackImages', componentId, versionId] })
        .then(() => {
          setIsPostBuildFetching(false);
        })
        .catch(() => {
          setIsPostBuildFetching(false);
        });
    }
    prevIsBuildPendingRef.current = isBuildPending;
  }, [isBuildPending, componentId, versionId, qc]);

  // Keep selectedImage in sync with the latest image on normal loads
  useEffect(() => {
    if (!isPostBuildFetching && images.length > 0) setSelectedImage(images[0]);
  }, [images[0]?.imageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAutoDeployEnabled(initialAutoDeployEnabled ?? false);
  }, [initialAutoDeployEnabled]);

  const isLatest = selectedImage?.imageId === images[0]?.imageId;
  const isDeploying = deployTrack.isPending;
  // Image-only components (e.g. knowledge base data sources) have no builds, so there is
  // no image to pick. Once deployed they can still be redeployed: an empty imageId makes
  // the BFF cut a new release from the current workload, picking up component changes.
  // Only once the images have loaded: a failed fetch is not the same as having none.
  const redeployCurrent = imagesLoaded && images.length === 0 && !!firstEnvReleaseId;
  // A picked image must still be in the loaded list, so a stale pick is not deployed.
  const imagePicked = !!selectedImage?.imageId && !imagesLoading && images.some((i) => i.imageId === selectedImage?.imageId);
  const { data: workflowRuntime } = useWorkflowRuntime(isWorkflow);
  // A workflow's worker needs the runtime to connect to; the environment card says why it is not ready.
  const workflowRuntimeBlocked = isWorkflow && workflowRuntime?.status !== 'READY';
  const canDeploy = (imagePicked || redeployCurrent) && !!firstEnvId && !isDeploying && !isBuildPending && !workflowRuntimeBlocked;

  const handleDeploy = () => {
    if (!canDeploy) return;
    deployTrack.mutate({
      componentId,
      id: versionId,
      imageId: selectedImage?.imageId ?? '',
      environmentId: firstEnvId,
      deploymentPipelineId,
    });
    setSplitOpen(false);
  };

  const handleConfigureAndDeploy = () => {
    setSplitOpen(false);
    setConfigureOpen(true);
  };

  const handleMainButtonClick = () => {
    if (selectedDeployAction === 'deploy') {
      handleDeploy();
    } else {
      handleConfigureAndDeploy();
    }
  };

  const handleSelectDeploy = () => {
    setSelectedDeployAction('deploy');
    setSplitOpen(false);
  };

  const handleSelectConfigureAndDeploy = () => {
    setSelectedDeployAction('configure');
    setSplitOpen(false);
  };

  const handleConfigureSaved = () => {
    setDeployConfirmOpen(true);
  };

  const handleAutoDeployToggle = (enabled: boolean) => {
    setAutoDeployEnabled(enabled);
    updateAutoDeploy.mutate(
      {
        componentId,
        deploymentTrackId: versionId,
        branch,
        enableAutoDeploy: enabled,
      },
      { onError: () => setAutoDeployEnabled(!enabled) },
    );
  };

  if (flags.isByoi) {
    return <ByoiBuildArea componentId={componentId} versionId={versionId} orgHandler={orgHandler} orgUuid={orgUuid} projectId={projectId} firstEnvId={firstEnvId} />;
  }

  return (
    <>
      <Card
        sx={{
          width: 320,
          flexShrink: 0,
          position: 'sticky',
          top: 24,
          alignSelf: 'flex-start',
          background: 'transparent',
        }}>
        <CardContent>
          <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
            Set up
          </Typography>

          <Divider sx={{ mb: 2 }} />

          {imagesLoading || isPostBuildFetching ? (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 2 }}>
              <Skeleton variant="text" width="40%" sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="65%" sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="50%" sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="55%" />
            </Box>
          ) : isBuildPending ? (
            <Box sx={{ mb: 2 }}>
              <BuildImageCard
                image={{
                  imageId: '',
                  createdAt: pendingBuild!.startedAt,
                  updatedAt: pendingBuild!.startedAt,
                  commitHash: pendingBuild!.sha,
                  commitMessage: buildingCommit?.message ?? pendingBuild!.sha.slice(0, 8),
                  builtAt: pendingBuild!.startedAt,
                  runId: String(pendingBuild!.id),
                  author: buildingCommit?.author ? { name: buildingCommit.author.name, email: buildingCommit.author.email, date: buildingCommit.author.date, avatarUrl: buildingCommit.author.avatarUrl } : { name: '', email: '', date: '', avatarUrl: '' },
                }}
                isLatest={false}
                buildState={isBuildRunning ? 'running' : 'queued'}
                variant="detail"
              />
            </Box>
          ) : imagesFailed ? (
            <Alert
              severity="error"
              sx={{ mb: 2 }}
              action={
                <Button color="inherit" size="small" onClick={() => refetchImages()}>
                  Retry
                </Button>
              }>
              Could not load the build images.
            </Alert>
          ) : images.length === 0 ? (
            <Box sx={{ py: 2 }}>
              <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1, color: 'text.secondary' }}>
                <Rocket size={16} />
                <Typography variant="body2" color="text.secondary">
                  {redeployCurrent ? 'No build images for this component.' : 'No images available yet.'}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {redeployCurrent ? 'Deploy redeploys the current image with the latest component settings.' : 'Trigger a build from the Build page first.'}
              </Typography>
            </Box>
          ) : (
            selectedImage && (
              <Box sx={{ mb: 2 }}>
                <BuildImageCard image={selectedImage} isLatest={isLatest} variant="detail" onEdit={() => setImageDrawerOpen(true)} />
              </Box>
            )
          )}

          <Divider sx={{ borderStyle: 'dashed', mb: 1.5 }} />

          {/* ── Auto Deploy on Build ── */}
          {autoDeployAvailable && (
            <FormControlLabel
              control={<Switch size="small" checked={autoDeployEnabled} onChange={(e) => handleAutoDeployToggle(e.target.checked)} disabled={updateAutoDeploy.isPending || !can(Scopes.INTEGRATION_UPDATE)} />}
              label={
                <Stack direction="row" alignItems="center" gap={0.5}>
                  <Typography variant="body2">Auto deploy on build</Typography>
                  {updateAutoDeploy.isPending && <CircularProgress size={12} />}
                </Stack>
              }
              sx={{ mb: 2, ml: 0, mr: 0, width: '100%', justifyContent: 'space-between', flexDirection: 'row-reverse' }}
            />
          )}

          {/* ── Endpoint Configurations (only for deployed service integrations;
               hidden for file/event/AI-agent, which have no endpoints) ── */}
          {!flags.isAutomation && !hideEndpoints && !!firstEnvReleaseId && (
            <Button variant="text" size="small" startIcon={<Settings size={14} />} onClick={() => setEndpointConfigOpen(true)} sx={{ mb: 2, width: '100%', justifyContent: 'flex-start' }}>
              Endpoint configurations
            </Button>
          )}

          {/* ── Deploy / Configure & Deploy split button ── */}
          {can(Scopes.INTEGRATION_DEPLOY) && (
            <Box sx={{ position: 'relative' }}>
              <ButtonGroup variant="contained" size="small" ref={splitButtonRef} disabled={!canDeploy} sx={{ width: '100%' }}>
                <Button
                  startIcon={isDeploying || isBuildRunning ? <CircularProgress color="inherit" size={14} /> : selectedDeployAction === 'deploy' ? <Rocket size={14} /> : <Settings size={14} />}
                  onClick={handleMainButtonClick}
                  sx={{ whiteSpace: 'nowrap', flex: 1 }}>
                  {isDeploying ? 'Deploying…' : isBuildRunning ? 'Building & deploying' : isBuildPending ? 'Build queued' : workflowRuntimeBlocked ? 'Preparing workflow runtime' : selectedDeployAction === 'deploy' ? 'Deploy' : 'Configure & deploy'}
                </Button>
                <Button size="small" sx={{ px: 0.5 }} aria-label="More deploy options" aria-expanded={splitOpen} onClick={() => setSplitOpen((prev) => !prev)}>
                  <ChevronDown size={14} />
                </Button>
              </ButtonGroup>
              <Popper open={splitOpen} anchorEl={splitButtonRef.current} placement="bottom-start" transition style={{ zIndex: 1300 }}>
                {({ TransitionProps }) => (
                  <Grow {...TransitionProps}>
                    <Paper elevation={3}>
                      <ClickAwayListener onClickAway={() => setSplitOpen(false)}>
                        <MenuList dense sx={{ minWidth: 280, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 3 }}>
                          <MenuItem onClick={handleSelectDeploy} selected={selectedDeployAction === 'deploy'}>
                            <Stack direction="row" alignItems="center" gap={1}>
                              <Rocket size={14} />
                              <Typography variant="body2">Deploy</Typography>
                            </Stack>
                          </MenuItem>
                          {can(Scopes.CONFIG_MANAGE) && (
                            <MenuItem onClick={handleSelectConfigureAndDeploy} selected={selectedDeployAction === 'configure'}>
                              <Stack direction="row" alignItems="center" gap={1}>
                                <Settings size={14} />
                                <Typography variant="body2">Configure &amp; deploy</Typography>
                              </Stack>
                            </MenuItem>
                          )}
                        </MenuList>
                      </ClickAwayListener>
                    </Paper>
                  </Grow>
                )}
              </Popper>
            </Box>
          )}
          {deployTrack.isError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {deployTrack.error.message}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Endpoint configuration drawer */}
      {!flags.isAutomation && !hideEndpoints && !!firstEnvReleaseId && (
        <EndpointConfigDrawer open={endpointConfigOpen} onClose={() => setEndpointConfigOpen(false)} projectId={projectId} componentId={componentId} versionId={versionId} firstEnvReleaseId={firstEnvReleaseId} firstEnvId={firstEnvId} isWorkflow={isWorkflow} />
      )}

      {/* Image selection drawer */}
      <BuildAreaImageDrawer open={imageDrawerOpen} onClose={() => setImageDrawerOpen(false)} images={images} isLoading={imagesLoading} selectedImageId={selectedImage?.imageId ?? null} onSelect={setSelectedImage} />

      {/* Configure env vars (opened via Configure & Deploy) */}
      <ConfigureDrawer
        isWorkflow={isWorkflow}
        isMcpServer={isMcpServer}
        open={configureOpen}
        onClose={() => setConfigureOpen(false)}
        onSaved={handleConfigureSaved}
        orgHandler={orgHandler}
        projectId={projectId}
        componentId={componentId}
        envId={firstEnvId}
        versionId={versionId}
        componentName={componentName}
        projectHandler={projectHandler}
        commitHash={selectedImage?.commitHash}
        releaseId={firstEnvReleaseId}
        displayType={displayType}
        isAutomation={flags.isAutomation}
        envTemplateId={firstEnvTemplateId}
        continueWithoutChanges
      />

      {/* Confirm deploy after configure */}
      <Dialog open={deployConfirmOpen} onClose={() => setDeployConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Deploy now?</DialogTitle>
        <DialogContent>
          <DialogContentText>Configuration saved. Would you like to deploy the selected image to the first environment now?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={() => setDeployConfirmOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!canDeploy}
            onClick={() => {
              setDeployConfirmOpen(false);
              handleDeploy();
            }}>
            Deploy
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
