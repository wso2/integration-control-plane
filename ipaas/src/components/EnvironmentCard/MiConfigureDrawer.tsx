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

import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useEnvEndpoints } from '../../hooks/useDeployments';
import { useMiConfig, useSaveMiConfig } from '../../hooks/useMiConfig';
import type { EnvEndpoint } from '../../types/component';
import type { MiConfig } from '../../types/envGroups';
import { toEndpointOptions } from '../../utils/endpoints';
import { isEmptyMiConfigSavePlan, planMiConfigSave, toMiConfigDraft, validateMiConfigDraft } from '../../utils/miConfigs';
import { generateUUID } from '../../utils/string';
import { EndpointCard } from '../EndpointCard';
import ApiSettingsDrawer from '../Overview/integration-as-api/ApiSettingsDrawer';
import { ManageEndpoint, StepIndicator } from './ConfigureSteps';
import MiConfigEditor, { MiConfigEditorSkeleton, type MiConfigRow } from './MiConfigEditor';
import { bodySx, drawerSx, footerSx, headerSx } from './MiConfigEditor.styles';

const STEPS = ['Configurations', 'Endpoints'];

interface MiConfigureDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called after a save that changed something, or on Continue with `continueWithoutChanges`. */
  onSaved?: () => void;
  projectId: string;
  componentId: string;
  /** The environment slug (not its template). */
  envId: string;
  versionId: string;
  /** The environment's release; empty when the integration is not deployed there. */
  releaseId?: string;
  /** Add an Endpoints step after the configurations (services). */
  showEndpoints?: boolean;
  /** Configure & Deploy: offer Continue (calls `onSaved`) when nothing changed or nothing can be set yet. */
  continueWithoutChanges?: boolean;
}

/**
 * Configure an MI integration: a free-form list of environment variables and
 * secrets per environment, which MI reads as `${configs.<name>}` (devant's
 * MiConfigurationSelector). MI has no configuration schema, so this replaces the
 * Ballerina schema form. See `utils/miConfigs.ts` for how it is stored.
 */
export default function MiConfigureDrawer({ open, onClose, onSaved, projectId, componentId, envId, versionId, releaseId, showEndpoints: endpointsEnabled = false, continueWithoutChanges = false }: MiConfigureDrawerProps): JSX.Element {
  const isDeployed = !!releaseId;
  // Endpoints belong to a release, so the step needs a deployment too.
  const showEndpoints = endpointsEnabled && isDeployed;
  const lastStep = showEndpoints ? 2 : 1;
  const { data, isLoading, isError, refetch } = useMiConfig(projectId, componentId, envId, open && isDeployed);
  const { data: endpoints = [] } = useEnvEndpoints(open && showEndpoints ? componentId : '', open && showEndpoints ? versionId : '', open && showEndpoints && releaseId ? releaseId : '');
  const save = useSaveMiConfig(projectId, componentId, envId);
  const [step, setStep] = useState(1);
  const [envVars, setEnvVars] = useState<MiConfigRow[]>([]);
  const [secrets, setSecrets] = useState<MiConfigRow[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [managingEp, setManagingEp] = useState<EnvEndpoint | null>(null);
  const [settingsEp, setSettingsEp] = useState<EnvEndpoint | null>(null);
  const seededRef = useRef(false);

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  const seed = (config: MiConfig) => {
    setEnvVars(config.envVars.map((e) => ({ id: generateUUID(), key: e.key, value: e.value })));
    setSecrets(config.secrets.map((key) => ({ id: generateUUID(), key, value: '', stored: true })));
    seededRef.current = true;
  };

  // Seed on open, or when data arrives after opening; never over the user's edits.
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    setShowErrors(false);
    setSaveError(null);
    if (data && !seededRef.current) seed(data);
  }, [open, data]);

  // Back to the first step on open; not on data refetches, which would move the user mid-edit.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setManagingEp(null);
  }, [open]);

  const draft = useMemo(() => toMiConfigDraft(envVars, secrets), [envVars, secrets]);
  const storedSecrets = useMemo(() => secrets.filter((s) => s.stored).map((s) => s.key), [secrets]);
  const errors = useMemo(() => validateMiConfigDraft(draft, storedSecrets), [draft, storedSecrets]);
  const plan = useMemo(() => (data ? planMiConfigSave(data, draft) : null), [data, draft]);
  const hasChanges = !!plan && !isEmptyMiConfigSavePlan(plan);

  // Errors on blank rows only show after a save attempt, so a just-added row is not red.
  const errorFor = (id: string, key: string): string => {
    const err = errors.get(id);
    return err && (showErrors || key.trim() !== '') ? err : '';
  };

  // Errors are on the Configurations step, so a blocked draft goes back there to show them.
  const checkDraft = (): boolean => {
    if (errors.size === 0) return true;
    setShowErrors(true);
    setStep(1);
    return false;
  };

  const handleNext = () => {
    setSaveError(null);
    if (checkDraft()) setStep(2);
  };

  const handleFinish = () => {
    setSaveError(null);
    if (isDeployed && !checkDraft()) return;
    if (!hasChanges) {
      handleClose();
      if (continueWithoutChanges) onSaved?.();
      return;
    }
    if (!plan) return;
    save.mutate(plan, {
      onSuccess: () => {
        onClose();
        onSaved?.();
      },
      onError: (err) => setSaveError(err instanceof Error ? err.message : 'Failed to save the configurations.'),
    });
  };

  const renderEndpoints = () => {
    if (managingEp) {
      return <ManageEndpoint ep={managingEp} componentId={componentId} projectId={projectId} versionId={versionId} releaseId={releaseId ?? ''} onBack={() => setManagingEp(null)} />;
    }
    if (!endpoints.length) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No endpoints available for this deployment.
        </Typography>
      );
    }
    return (
      <Box>
        {endpoints.map((ep, idx) => (
          <EndpointCard key={ep.id} ep={ep} defaultExpanded={idx === 0} onEdit={setManagingEp} onSettings={setSettingsEp} />
        ))}
      </Box>
    );
  };

  const renderContent = () => {
    if (!isDeployed) {
      return <Alert severity="info">{continueWithoutChanges ? 'Configurations can be set once the integration is deployed to this environment. Continue to deploy it.' : 'Deploy the integration to this environment to set its configurations.'}</Alert>;
    }
    if (isLoading) return <MiConfigEditorSkeleton />;
    if (isError || !data) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }>
          Could not load the configurations.
        </Alert>
      );
    }
    return <MiConfigEditor envVars={envVars} secrets={secrets} onEnvVarsChange={setEnvVars} onSecretsChange={setSecrets} errorFor={errorFor} showErrorSummary={showErrors && errors.size > 0} />;
  };

  // The last step saves when something changed. With nothing to save it continues the
  // Configure & Deploy flow, closes the Endpoints step (whose edits apply on their own), or waits.
  const finishLabel = save.isPending ? 'Saving…' : hasChanges ? 'Save' : continueWithoutChanges ? 'Continue' : step === 2 ? 'Done' : 'Save';
  const finishDisabled = save.isPending || (!hasChanges && !continueWithoutChanges && step !== 2);
  const showFinish = isDeployed || continueWithoutChanges;

  return (
    <>
      <Drawer anchor="right" open={open} onClose={handleClose} variant="temporary" sx={drawerSx}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={headerSx}>
          <Typography variant="h5">Configurations</Typography>
          <IconButton size="small" aria-label="close" onClick={handleClose}>
            <X size={16} />
          </IconButton>
        </Stack>

        {showEndpoints && <StepIndicator step={step} steps={STEPS} />}

        <Box sx={bodySx}>{step === 1 ? renderContent() : renderEndpoints()}</Box>

        {saveError && (
          <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
            {saveError}
          </Alert>
        )}

        {/* ManageEndpoint has its own Cancel/Update. */}
        {!(step === 2 && managingEp) && (
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={footerSx}>
            <Button onClick={step === 2 ? () => setStep(1) : handleClose}>{step === 2 ? 'Back' : 'Cancel'}</Button>
            {step < lastStep ? (
              <Button variant="contained" onClick={handleNext}>
                Next
              </Button>
            ) : (
              showFinish && (
                <Button variant="contained" onClick={handleFinish} disabled={finishDisabled} startIcon={save.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
                  {finishLabel}
                </Button>
              )
            )}
          </Stack>
        )}
      </Drawer>

      {showEndpoints && <ApiSettingsDrawer open={settingsEp !== null} onClose={() => setSettingsEp(null)} componentName={componentId} envName={envId} endpoints={toEndpointOptions(endpoints)} activeEndpointName={settingsEp?.id} />}
    </>
  );
}
