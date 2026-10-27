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

import { Box, Button, CircularProgress, Divider, Grid, Step, StepLabel, Stepper, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ArrowRight } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import ProbeConfigFields from './ProbeConfigFields';
import ProbeSliderGroup, { type ProbeSliderValues } from './ProbeSliderGroup';
import { useCreateHealthCheck } from '../../hooks/useHealthChecks';
import { defaultProbeForm, formToProbe, isProbeFormValid, type ProbeFormState } from '../../utils/healthChecks';
import { PROBE_KIND, type WriteProbe } from '../../types/healthChecks';
import type { ReleaseContainer } from '../../types/devopsConfigs';

interface CreateHealthCheckStepperProps {
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

const STEPS = ['Configure Liveness Probe', 'Configure Readiness Probe'];

export default function CreateHealthCheckStepper({ container, projectId, componentId, releaseId, deploymentTrackId, environmentId, onClose, onSaved, onError }: CreateHealthCheckStepperProps): JSX.Element {
  const fallbackPort = container.ports?.[0]?.port ?? 8080;
  const [activeStep, setActiveStep] = useState(0);
  const [liveness, setLiveness] = useState<ProbeFormState>(() => defaultProbeForm(fallbackPort));
  const [readiness, setReadiness] = useState<ProbeFormState>(() => defaultProbeForm(fallbackPort));
  const create = useCreateHealthCheck(projectId);

  const isLivenessStep = activeStep === 0;
  const form = isLivenessStep ? liveness : readiness;
  const setForm = isLivenessStep ? setLiveness : setReadiness;
  const patch = (p: Partial<ProbeFormState>): void => setForm((prev) => ({ ...prev, ...p }));
  const setSlider = (field: keyof ProbeSliderValues, value: number): void => patch({ [field]: value } as Partial<ProbeFormState>);

  const submit = (includeReadiness: boolean): void => {
    const readinessProbe: WriteProbe = includeReadiness ? formToProbe(readiness) : {};
    create.mutate(
      { componentId, releaseId, environmentId, deploymentTrackId, containerId: container.ID, data: { probes: { liveness_probe: formToProbe(liveness), readiness_probe: readinessProbe } } },
      {
        onSuccess: () => onSaved('Health check created.'),
        onError: (e) => onError(e instanceof Error ? e.message : 'Failed to create the health check.'),
      },
    );
  };

  return (
    <Box>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={onClose} sx={{ px: 0, mb: 3 }}>
        Go Back to Health Checks
      </Button>
      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Stepper activeStep={activeStep} orientation="vertical">
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Grid>
        <Grid size={{ xs: 12, md: 9 }}>
          <Stack direction="row" alignItems="baseline" gap={1.5} sx={{ mb: 3 }}>
            <Typography variant="h5" fontWeight={700}>
              {STEPS[activeStep]}
            </Typography>
            {!isLivenessStep && (
              <Typography variant="body2" color="text.secondary">
                Optional
              </Typography>
            )}
          </Stack>

          <ProbeSliderGroup
            values={{ failureThreshold: form.failureThreshold, successThreshold: form.successThreshold, initialDelaySeconds: form.initialDelaySeconds, periodSeconds: form.periodSeconds, timeoutSeconds: form.timeoutSeconds }}
            showSuccess={!isLivenessStep}
            onChange={setSlider}
          />

          <Divider sx={{ my: 3 }} />

          <ProbeConfigFields kind={isLivenessStep ? PROBE_KIND.LIVENESS : PROBE_KIND.READINESS} form={form} onChange={patch} />

          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            {isLivenessStep ? (
              <>
                <Button variant="outlined" onClick={onClose} disabled={create.isPending}>
                  Cancel
                </Button>
                <Button variant="contained" onClick={() => setActiveStep(1)} disabled={!isProbeFormValid(liveness)}>
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button variant="outlined" onClick={() => setActiveStep(0)} disabled={create.isPending}>
                  Back
                </Button>
                <Button variant="contained" onClick={() => submit(true)} disabled={create.isPending || !isProbeFormValid(liveness) || !isProbeFormValid(readiness)} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
                  Save
                </Button>
                <Button variant="text" endIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : <ArrowRight size={16} />} onClick={() => submit(false)} disabled={create.isPending || !isProbeFormValid(liveness)}>
                  Skip
                </Button>
              </>
            )}
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
