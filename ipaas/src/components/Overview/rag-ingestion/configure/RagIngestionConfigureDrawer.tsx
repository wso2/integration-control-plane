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

import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, Maximize2, Minimize2, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useComponentDeployment } from '../../../../hooks/useDeployments';
import { useRelease } from '../../../../hooks/useDevopsConfigs';
import { useOrgUuid } from '../../../../hooks/useOrgUuid';
import { mainContainer } from '../../../../utils/devopsConfigs';
import { ragIngestionImage } from '../../../../hooks/useRagIngestion';
import type { EditorContext } from '../../../Configs/ConfigEditor';
import type { Component } from '../../../../types/component';
import type { Environment } from '../../../../types/environment';
import ConfigStep from './ConfigStep';
import ScheduleStep from './ScheduleStep';
import ImageStep from './ImageStep';

/** The steps this BYOI configure drawer can show. Env-vars + file mounts are the
 * base config; schedule + image are the "external" BYOI steps toggled per type. */
export type ConfigureStep = 'envVars' | 'fileMount' | 'schedule' | 'image';

const STEP_LABELS: Record<ConfigureStep, string> = {
  envVars: 'Environment Variables',
  fileMount: 'Configuration File',
  schedule: 'Schedule',
  image: 'Update Image',
};

/** Full step set for a RAG ingestion (BYOI scheduled task). */
const RAG_INGESTION_STEPS: ConfigureStep[] = ['envVars', 'fileMount', 'schedule', 'image'];

interface RagIngestionConfigureDrawerProps {
  open: boolean;
  onClose: () => void;
  component: Component;
  env: Environment;
  versionId: string;
  orgHandler: string;
  projectId: string;
  deploymentPipelineId: string;
  /** Which steps to show. Defaults to the full RAG ingestion set; other BYOI
   * types can drop the external (schedule/image) steps via this prop. */
  steps?: ConfigureStep[];
}

/**
 * A reusable BYOI "Configure" drawer — a stepper of Environment Variables,
 * Configuration File, Schedule and Update Image, matching devant's
 * ConfigByoiWizard. The visible steps are configurable (`steps` prop) so the
 * same drawer serves RAG ingestion and other BYOI types. Each step edits + saves
 * its own surface; the stepper is navigation only. Supports an enlarge toggle
 * since the configuration surfaces can get dense.
 */
export default function RagIngestionConfigureDrawer({ open, onClose, component, env, versionId, orgHandler, projectId, deploymentPipelineId, steps = RAG_INGESTION_STEPS }: RagIngestionConfigureDrawerProps): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';
  const [stepIndex, setStepIndex] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const [notice, setNotice] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // The drawer stays mounted while closed (gated on hasDeployment upstream), so
  // reset to the first step and clear any stale notice each time it reopens.
  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setNotice(null);
    }
  }, [open]);

  const { data: deployment, isLoading: loadingDeployment } = useComponentDeployment(orgHandler, orgUuid, component.id, versionId, env.id);
  const releaseId = deployment?.releaseId ?? '';
  const { data: release, isLoading: loadingRelease } = useRelease(projectId, component.id, releaseId, versionId);
  const containerId = useMemo(() => mainContainer(release?.containers)?.ID ?? '', [release]);

  const ctx: EditorContext = { projectId, componentId: component.id, releaseId, containerId, envId: env.id, deploymentTrackId: versionId };
  const notify = (message: string, severity: 'success' | 'error') => setNotice({ message, severity });
  const loading = loadingDeployment || loadingRelease;
  const ready = !!releaseId && !!containerId;
  const activeStep = steps[Math.min(stepIndex, steps.length - 1)];

  const drawerSx = {
    '& .MuiDrawer-paper': {
      width: enlarged ? 'min(1100px, 96vw)' : 560,
      maxWidth: '100vw',
      position: 'fixed',
      top: 64,
      height: 'calc(100% - 64px)',
      borderLeft: '1px solid',
      borderColor: 'divider',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
    },
  } as const;

  return (
    <Drawer anchor="right" open={open} onClose={onClose} variant="temporary" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="h5">Configurations</Typography>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Tooltip title={enlarged ? 'Shrink' : 'Enlarge'}>
            <IconButton size="small" aria-label={enlarged ? 'Shrink drawer' : 'Enlarge drawer'} onClick={() => setEnlarged((v) => !v)}>
              {enlarged ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
          </Tooltip>
          <IconButton size="small" aria-label="close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </Stack>
      </Stack>

      {/* Numbered step indicator */}
      <Stack direction="row" alignItems="center" sx={{ px: 3, py: 2, gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
        {steps.map((key, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <Stack key={key} direction="row" alignItems="center" gap={0.75} sx={{ opacity: active || done ? 1 : 0.6 }}>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  color: active || done ? 'primary.contrastText' : 'text.secondary',
                  bgcolor: active || done ? 'primary.main' : 'action.selected',
                }}>
                {done ? <Check size={13} /> : i + 1}
              </Box>
              <Typography variant="caption" sx={{ fontWeight: active ? 600 : 400 }}>
                {STEP_LABELS[key]}
              </Typography>
            </Stack>
          );
        })}
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
        {notice && (
          <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
            {notice.message}
          </Alert>
        )}

        {loading ? (
          <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', my: 4 }} />
        ) : !ready ? (
          <Alert severity="info">Deploy this ingestion to the selected environment to manage its configuration.</Alert>
        ) : (
          <>
            {activeStep === 'envVars' && <ConfigStep ctx={ctx} kind="envVars" emptyText="No environment variables configured." onNotify={notify} />}
            {activeStep === 'fileMount' && <ConfigStep ctx={ctx} kind="fileMount" emptyText="No configuration files mounted." onNotify={notify} />}
            {activeStep === 'schedule' && <ScheduleStep componentId={component.id} versionId={versionId} envId={env.id} releaseId={releaseId} deploymentPipelineId={deploymentPipelineId} buildId={deployment?.build?.buildId ?? ''} onNotify={notify} />}
            {activeStep === 'image' && <ImageStep componentId={component.id} releaseId={releaseId} currentImage={deployment?.imageUrl || ragIngestionImage()} onNotify={notify} />}
          </>
        )}
      </Box>

      <Stack direction="row" justifyContent="space-between" sx={{ px: 3, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button onClick={() => setStepIndex((s) => Math.max(0, s - 1))} disabled={stepIndex === 0}>
          Back
        </Button>
        {stepIndex < steps.length - 1 ? (
          <Button variant="contained" onClick={() => setStepIndex((s) => Math.min(steps.length - 1, s + 1))}>
            Next
          </Button>
        ) : (
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        )}
      </Stack>
    </Drawer>
  );
}
