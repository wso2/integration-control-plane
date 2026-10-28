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

import { Alert, Box, Button, CircularProgress, Divider, FormControlLabel, Grid, Radio, RadioGroup, Slider, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type JSX } from 'react';
import ResourceRangeSlider from '../common/ResourceRangeSlider';
import { useUpdateContainer } from '../../hooks/useDevopsConfigs';
import { CPU_MAX, CPU_MIN, CPU_STEP, MEMORY_MAX, MEMORY_MIN, MEMORY_STEP, MIN_GAP_CPU, MIN_GAP_MEMORY, containerToForm, formToWriteData } from '../../utils/containers';
import { IMAGE_PULL_POLICY, type ImagePullPolicy, type ReleaseContainer } from '../../types/devopsConfigs';

interface ContainerEditFormProps {
  container: ReleaseContainer;
  projectId: string;
  componentId: string;
  releaseId: string;
  /** Paid subscription or Private Data Plane — resource limits are configurable. */
  isPaidOrPdpUser: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const cpuFmt = (v: number): string => String(Math.round(v * 100) / 100);
const memFmt = (v: number): string => String(Math.round(v));

export default function ContainerEditForm({ container, projectId, componentId, releaseId, isPaidOrPdpUser, onClose, onSaved, onError }: ContainerEditFormProps): JSX.Element {
  const [form, setForm] = useState(() => containerToForm(container));
  const initialForm = useRef(form).current;
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const update = useUpdateContainer(projectId, componentId, releaseId);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (): void => {
    update.mutate(
      { containerId: container.ID, data: formToWriteData(form, container.ports ?? []) },
      {
        onSuccess: () => onSaved('Container updated.'),
        onError: (e) => onError(e instanceof Error ? e.message : 'Failed to update the container.'),
      },
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={onClose} sx={{ px: 0 }}>
          Go Back
        </Button>
      </Box>

      {!isPaidOrPdpUser && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Resource requests and limits can only be configured with an upgraded subscription or private data plane.
        </Alert>
      )}

      <Grid container spacing={4} sx={{ mb: 1 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          {form.limitsEnabled ? (
            <ResourceRangeSlider
              label="CPU Request / Limit"
              unit="CPU"
              min={CPU_MIN}
              max={CPU_MAX}
              step={CPU_STEP}
              minGap={MIN_GAP_CPU}
              request={form.cpuRequest}
              limit={form.cpuLimit}
              onRequestChange={(v) => set('cpuRequest', v)}
              onLimitChange={(v) => set('cpuLimit', v)}
              disabled={!isPaidOrPdpUser}
              format={cpuFmt}
            />
          ) : (
            <SingleResourceSlider label="CPU Request" unit="CPU" min={CPU_MIN} max={CPU_MAX} step={CPU_STEP} value={form.cpuRequest} onChange={(v) => set('cpuRequest', v)} disabled={!isPaidOrPdpUser} format={cpuFmt} />
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          {form.limitsEnabled ? (
            <ResourceRangeSlider
              label="Memory Request / Limit"
              unit="Mi"
              min={MEMORY_MIN}
              max={MEMORY_MAX}
              step={MEMORY_STEP}
              minGap={MIN_GAP_MEMORY}
              request={form.memRequest}
              limit={form.memLimit}
              onRequestChange={(v) => set('memRequest', v)}
              onLimitChange={(v) => set('memLimit', v)}
              disabled={!isPaidOrPdpUser}
              format={memFmt}
            />
          ) : (
            <SingleResourceSlider label="Memory Request" unit="Mi" min={MEMORY_MIN} max={MEMORY_MAX} step={MEMORY_STEP} value={form.memRequest} onChange={(v) => set('memRequest', v)} disabled={!isPaidOrPdpUser} format={memFmt} />
          )}
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Grid container alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Image Pull Policy
          </Typography>
        </Grid>
        <Grid size={{ xs: 12, md: 9 }}>
          <RadioGroup row value={form.imagePullPolicy} onChange={(e) => set('imagePullPolicy', e.target.value as ImagePullPolicy)}>
            <FormControlLabel value={IMAGE_PULL_POLICY.ALWAYS} control={<Radio />} label="Always" />
            <FormControlLabel value={IMAGE_PULL_POLICY.IF_NOT_PRESENT} control={<Radio />} label="If Not Present" />
          </RadioGroup>
        </Grid>
      </Grid>

      <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={update.isPending || !isDirty} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          Save Changes
        </Button>
      </Stack>
    </Box>
  );
}

interface SingleResourceSliderProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  format: (value: number) => string;
}

/** Request-only slider shown when resource limits are disabled. */
function SingleResourceSlider({ label, unit, min, max, step, value, onChange, disabled, format }: SingleResourceSliderProps): JSX.Element {
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {format(value)} {unit}
        </Typography>
      </Stack>
      <Box sx={{ px: 1 }}>
        <Slider value={value} min={min} max={max} step={step} disabled={disabled} onChange={(_e, v) => onChange(v as number)} valueLabelDisplay="auto" valueLabelFormat={(v) => format(v as number)} aria-label={label} />
      </Box>
    </Box>
  );
}
