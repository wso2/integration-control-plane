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

import { Button, CircularProgress, Stack } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import { useUpdateHttpScaler } from '../../../hooks/useScaling';
import RangeInput from '../../../components/Scaling/RangeInput';
import type { HttpScaler, ScalingPath } from '../../../types/scaling';

interface ScaleToZeroConfigProps {
  projectId: string;
  path: ScalingPath;
  scaler: HttpScaler | null;
  maxReplicaCap: number;
  canManage: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const MAX_PENDING = Number.MAX_SAFE_INTEGER;

export default function ScaleToZeroConfig({ projectId, path, scaler, maxReplicaCap, canManage, onSaved, onError }: ScaleToZeroConfigProps): JSX.Element {
  const update = useUpdateHttpScaler(projectId);
  const [max, setMax] = useState(scaler?.max ?? 1);
  const [targetPending, setTargetPending] = useState(scaler?.target_pending_requests ?? 100);

  useEffect(() => {
    setMax(scaler?.max ?? 1);
    setTargetPending(scaler?.target_pending_requests ?? 100);
  }, [scaler]);

  const dirty = max !== (scaler?.max ?? 1) || targetPending !== (scaler?.target_pending_requests ?? 100);

  const save = () => {
    update.mutate(
      { path, data: { max, target_pending_requests: targetPending } },
      {
        onSuccess: () => onSaved('Scaling configuration saved.'),
        onError: (e) => onError(e instanceof Error ? e.message : 'Failed to save the scaling configuration.'),
      },
    );
  };

  return (
    <Stack gap={2.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={4}>
        <RangeInput label="Max replicas" value={max} onChange={setMax} min={0} max={maxReplicaCap} disabled={!canManage} />
        <RangeInput label="Number of pending requests to spawn a new pod" value={targetPending} onChange={setTargetPending} min={1} max={MAX_PENDING} disabled={!canManage} />
      </Stack>
      {canManage && (
        <Stack direction="row">
          <Button variant="contained" disabled={!dirty || update.isPending} onClick={save} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
