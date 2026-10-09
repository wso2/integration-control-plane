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

import { Box, Button, CircularProgress, FormControlLabel, Paper, Slider, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import { useCreateHpa, useHpaMetricMutations, useUpdateHpa } from '../../../hooks/useScaling';
import { CPU_THRESHOLD, MEMORY_THRESHOLD } from '../../../constants/scaling';
import RangeInput from '../../../components/Scaling/RangeInput';
import type { Hpa, HpaMetric, MetricResource, ScalingPath } from '../../../types/scaling';

interface HpaConfigProps {
  orgUuid: string;
  projectId: string;
  path: ScalingPath;
  version: string;
  maxReplicaCap: number;
  hpa: Hpa | null;
  canManage: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

function findMetric(hpa: Hpa | null, name: MetricResource): HpaMetric | undefined {
  return hpa?.metrics?.find((m) => m.rule.resource.name === name);
}

function buildMetric(name: MetricResource, value: number): HpaMetric {
  return { type: 'Resource', rule: { resource: { name, value: String(value), type: 'utilization' } } };
}

function ThresholdSlider({
  label,
  enabled,
  value,
  min,
  max,
  onToggle,
  onChange,
  disabled,
}: {
  label: string;
  enabled: boolean;
  value: number;
  min: number;
  max: number;
  onToggle: (v: boolean) => void;
  onChange: (v: number) => void;
  disabled: boolean;
}): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 260 }}>
      <FormControlLabel control={<Switch checked={enabled} onChange={(e) => onToggle(e.target.checked)} disabled={disabled} />} label={label} />
      <Box sx={{ px: 1, mt: 1, opacity: enabled ? 1 : 0.5 }}>
        <Slider value={value} min={min} max={max} onChange={(_e, v) => onChange(v as number)} disabled={disabled || !enabled} valueLabelDisplay="auto" />
        <Typography variant="caption" color="text.secondary">
          {value}% utilization
        </Typography>
      </Box>
    </Paper>
  );
}

export default function HpaConfig({ orgUuid, projectId, path, version, maxReplicaCap, hpa, canManage, onSaved, onError }: HpaConfigProps): JSX.Element {
  const createHpa = useCreateHpa(projectId);
  const updateHpa = useUpdateHpa(projectId);
  const metricMut = useHpaMetricMutations(projectId);

  const cpuMetric = findMetric(hpa, 'cpu');
  const memMetric = findMetric(hpa, 'memory');

  const [min, setMin] = useState(hpa?.min ?? 1);
  const [max, setMax] = useState(hpa?.max ?? 1);
  const [cpuEnabled, setCpuEnabled] = useState(!!cpuMetric);
  const [cpuValue, setCpuValue] = useState(cpuMetric ? Number(cpuMetric.rule.resource.value) : CPU_THRESHOLD.default);
  const [memEnabled, setMemEnabled] = useState(!!memMetric);
  const [memValue, setMemValue] = useState(memMetric ? Number(memMetric.rule.resource.value) : MEMORY_THRESHOLD.default);
  const [submitting, setSubmitting] = useState(false);

  // Resync when the saved HPA / its metrics change after a refetch.
  useEffect(() => {
    setMin(hpa?.min ?? 1);
    setMax(hpa?.max ?? 1);
    setCpuEnabled(!!cpuMetric);
    setCpuValue(cpuMetric ? Number(cpuMetric.rule.resource.value) : CPU_THRESHOLD.default);
    setMemEnabled(!!memMetric);
    setMemValue(memMetric ? Number(memMetric.rule.resource.value) : MEMORY_THRESHOLD.default);
  }, [hpa]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncMetric = async (hpaId: string, name: MetricResource, enabled: boolean, value: number, existing?: HpaMetric) => {
    if (enabled && existing?.ID) await metricMut.update.mutateAsync({ path, hpaId, metricId: existing.ID, data: buildMetric(name, value) });
    else if (enabled) await metricMut.create.mutateAsync({ path, hpaId, data: buildMetric(name, value) });
    else if (existing?.ID) await metricMut.remove.mutateAsync({ path, hpaId, metricId: existing.ID });
  };

  const save = async () => {
    setSubmitting(true);
    try {
      const body = { organization_id: orgUuid, project_id: projectId, version, app_environment_id: path.releaseId, min, max };
      const saved = hpa ? await updateHpa.mutateAsync({ path, hpaId: hpa.ID, data: body }) : await createHpa.mutateAsync({ path, data: body });
      await syncMetric(saved.ID, 'cpu', cpuEnabled, cpuValue, cpuMetric);
      await syncMetric(saved.ID, 'memory', memEnabled, memValue, memMetric);
      onSaved('Scaling configuration saved.');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save the scaling configuration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap={2.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={4}>
        <RangeInput label="Min replicas" value={min} onChange={(v) => setMin(Math.min(v, max))} min={1} max={max} disabled={!canManage} />
        <RangeInput label="Max replicas" value={max} onChange={(v) => setMax(Math.max(v, min))} min={min} max={maxReplicaCap} disabled={!canManage} />
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <ThresholdSlider label="CPU Threshold" enabled={cpuEnabled} value={cpuValue} min={CPU_THRESHOLD.min} max={CPU_THRESHOLD.max} onToggle={setCpuEnabled} onChange={setCpuValue} disabled={!canManage} />
        <ThresholdSlider label="Memory Threshold" enabled={memEnabled} value={memValue} min={MEMORY_THRESHOLD.min} max={MEMORY_THRESHOLD.max} onToggle={setMemEnabled} onChange={setMemValue} disabled={!canManage} />
      </Stack>
      {canManage && (
        <Stack direction="row">
          <Button variant="contained" disabled={submitting} onClick={save} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
