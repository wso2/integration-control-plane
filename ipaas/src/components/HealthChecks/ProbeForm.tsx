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

import { Box, Button, CircularProgress, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import ProbeConfigFields from './ProbeConfigFields';
import ProbeSliderGroup, { type ProbeSliderValues } from './ProbeSliderGroup';
import { useUpdateHealthCheck } from '../../hooks/useHealthChecks';
import { DEFAULT_PORT, defaultProbeForm, probeToForm, formToProbe, isProbeFormValid, serializeProbeForWrite, hasProbe, type ProbeFormState } from '../../utils/healthChecks';
import { PROBE_KIND, type HealthCheck, type ProbeKind, type WriteProbe } from '../../types/healthChecks';
import type { ReleaseContainer } from '../../types/devopsConfigs';

interface ProbeFormProps {
  kind: ProbeKind;
  healthCheck: HealthCheck;
  container: ReleaseContainer;
  projectId: string;
  componentId: string;
  releaseId: string;
  /** The deployment track the release belongs to. */
  deploymentTrackId: string;
  environmentId: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

export default function ProbeForm({ kind, healthCheck: hc, container, projectId, componentId, releaseId, deploymentTrackId, environmentId, onClose, onSaved, onError }: ProbeFormProps): JSX.Element {
  const fallbackPort = container.ports?.[0]?.port ?? DEFAULT_PORT;
  const isLiveness = kind === PROBE_KIND.LIVENESS;
  const editedProbe = isLiveness ? hc.probes.liveness_probe : hc.probes.readiness_probe;
  const existed = hasProbe(editedProbe);

  const [form, setForm] = useState<ProbeFormState>(() => (existed ? probeToForm(editedProbe, fallbackPort) : defaultProbeForm(fallbackPort)));
  const update = useUpdateHealthCheck(projectId);

  const patch = (p: Partial<ProbeFormState>): void => setForm((prev) => ({ ...prev, ...p }));
  const setSlider = (field: keyof ProbeSliderValues, value: number): void => patch({ [field]: value } as Partial<ProbeFormState>);

  const onSubmit = (): void => {
    const edited = formToProbe(form);
    const other = isLiveness ? hc.probes.readiness_probe : hc.probes.liveness_probe;
    const otherWrite: WriteProbe = serializeProbeForWrite(other, fallbackPort);
    const data = {
      probes: {
        liveness_probe: isLiveness ? edited : otherWrite,
        readiness_probe: isLiveness ? otherWrite : edited,
      },
    };
    update.mutate(
      { componentId, releaseId, environmentId, deploymentTrackId, containerId: container.ID, healthCheckId: hc.ID, data },
      {
        onSuccess: () => onSaved(`${kind} probe saved.`),
        onError: (e) => onError(e instanceof Error ? e.message : 'Failed to save the probe.'),
      },
    );
  };

  return (
    <Box>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={onClose} sx={{ px: 0, mb: 3 }}>
        Go Back to Health Checks
      </Button>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        {existed ? 'Edit' : 'Configure'} {kind} Probe
      </Typography>

      <ProbeSliderGroup
        values={{ failureThreshold: form.failureThreshold, successThreshold: form.successThreshold, initialDelaySeconds: form.initialDelaySeconds, periodSeconds: form.periodSeconds, timeoutSeconds: form.timeoutSeconds }}
        showSuccess={!isLiveness}
        onChange={setSlider}
      />

      <Divider sx={{ my: 3 }} />

      <ProbeConfigFields kind={kind} form={form} onChange={patch} />

      <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
        <Button variant="outlined" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onSubmit} disabled={update.isPending || !isProbeFormValid(form)} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          Save
        </Button>
      </Stack>
    </Box>
  );
}
