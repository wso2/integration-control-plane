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

import { Alert, Box, Button, Chip, CircularProgress, Stack } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import RangeInput from '../../../components/Scaling/RangeInput';
import { CLOUD_DP_MAX_REPLICAS } from '../../../constants/scaling';
import { useUpdateHpa } from '../../hooks/useScaling';
import type { Hpa, ScalingPath } from '../../../types/scaling';

interface ReplicaRangeControlProps {
  /** Absent when the release scales by a fixed replica count rather than an HPA. */
  hpa: Hpa | undefined;
  isLoading: boolean;
  /** The lookup failed, so the fixed replica count would be a guess rather than the truth. */
  isError: boolean;
  onRetry: () => void;
  replicas: number;
  orgUuid: string;
  projectId: string;
  path: ScalingPath;
  version: string;
  canManage: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

/**
 * Min/max replica steppers above the pod table. Reset and Update only appear once a
 * value differs from what the server holds, so the row stays quiet at rest.
 * Without an HPA there is nothing to edit and the fixed replica count is shown instead.
 */
export default function ReplicaRangeControl({ hpa, isLoading, isError, onRetry, replicas, orgUuid, projectId, path, version, canManage, onSaved, onError }: ReplicaRangeControlProps): JSX.Element {
  const [min, setMin] = useState(hpa?.min ?? 1);
  const [max, setMax] = useState(hpa?.max ?? 1);
  const updateHpa = useUpdateHpa(projectId);

  // Re-sync whenever the server sends different bounds (another tab, or our own save).
  useEffect(() => {
    setMin(hpa?.min ?? 1);
    setMax(hpa?.max ?? 1);
  }, [hpa?.min, hpa?.max]);

  if (isLoading) {
    return <CircularProgress size={16} />;
  }

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        }>
        Failed to load the scaling configuration.
      </Alert>
    );
  }

  if (!hpa) {
    return <Chip variant="outlined" label={`Replicas ${replicas}`} />;
  }

  const dirty = min !== hpa.min || max !== hpa.max;
  const saving = updateHpa.isPending;

  const reset = () => {
    setMin(hpa.min);
    setMax(hpa.max);
  };

  const save = () => {
    updateHpa.mutate(
      { path, hpaId: hpa.ID, data: { organization_id: orgUuid, project_id: projectId, version, app_environment_id: path.releaseId, min, max } },
      {
        onSuccess: () => onSaved('Scaling configuration updated. Changes may take a while to propagate.'),
        onError: (e) => {
          reset();
          onError(e instanceof Error ? e.message : 'Failed to update scaling configuration.');
        },
      },
    );
  };

  return (
    <Stack direction="row" alignItems="flex-end" gap={2} flexWrap="wrap">
      {/* Each bound clamps against the other, so min can never cross max. */}
      <RangeInput label="Min replicas" value={min} onChange={(v) => setMin(Math.min(v, max))} min={1} max={max} disabled={!canManage || saving} />
      <RangeInput label="Max replicas" value={max} onChange={(v) => setMax(Math.max(v, min))} min={min} max={CLOUD_DP_MAX_REPLICAS} disabled={!canManage || saving} />
      {dirty && (
        <Box sx={{ display: 'flex', gap: 1, pb: 0.5 }}>
          <Button size="small" variant="outlined" color="secondary" onClick={reset} disabled={saving}>
            Reset
          </Button>
          <Button size="small" variant="contained" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
            Update
          </Button>
        </Box>
      )}
    </Stack>
  );
}
