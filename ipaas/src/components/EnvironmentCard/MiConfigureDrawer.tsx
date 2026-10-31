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

import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Link, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import { Plus, Trash2, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { useEnvEndpoints } from '../../hooks/useDeployments';
import { useMiConfig, useSaveMiConfig } from '../../hooks/useMiConfig';
import { navUrl, useScope } from '../../nav';
import type { EnvEndpoint } from '../../types/component';
import type { MiConfig, MiConfigDraft } from '../../types/envGroups';
import { toEndpointOptions } from '../../utils/endpoints';
import { isEmptyMiConfigSavePlan, planMiConfigSave, validateMiConfigDraft } from '../../utils/miConfigs';
import { EndpointCard } from '../EndpointCard';
import ApiSettingsDrawer from '../Overview/integration-as-api/ApiSettingsDrawer';
import { ManageEndpoint, StepIndicator } from './ConfigureSteps';

const STEPS = ['Configurations', 'Endpoints'];

interface Row {
  id: number;
  key: string;
  value: string;
  /** A secret that is already stored: its value is write-only, blank means unchanged. */
  stored?: boolean;
}

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

const drawerSx = {
  '& .MuiDrawer-paper': {
    width: 560,
    position: 'fixed',
    top: 64,
    height: 'calc(100% - 64px)',
    borderLeft: '1px solid',
    borderColor: 'divider',
    display: 'flex',
    flexDirection: 'column',
  },
} as const;

/**
 * Configure an MI integration: a free-form list of environment variables and
 * secrets per environment, which MI reads as `${configs.<name>}` (devant's
 * MiConfigurationSelector). MI has no configuration schema, so this replaces the
 * Ballerina schema form. See `utils/miConfigs.ts` for how it is stored.
 */
export default function MiConfigureDrawer({ open, onClose, onSaved, projectId, componentId, envId, versionId, releaseId, showEndpoints: endpointsEnabled = false, continueWithoutChanges = false }: MiConfigureDrawerProps): JSX.Element {
  const scope = useScope();
  const isDeployed = !!releaseId;
  // Endpoints belong to a release, so the step needs a deployment too.
  const showEndpoints = endpointsEnabled && isDeployed;
  const lastStep = showEndpoints ? 2 : 1;
  const { data, isLoading, isError, refetch } = useMiConfig(projectId, componentId, envId, open && isDeployed);
  const { data: endpoints = [] } = useEnvEndpoints(open && showEndpoints ? componentId : '', open && showEndpoints ? versionId : '', open && showEndpoints && releaseId ? releaseId : '');
  const save = useSaveMiConfig(projectId, componentId, envId);
  const [step, setStep] = useState(1);
  const [envVars, setEnvVars] = useState<Row[]>([]);
  const [secrets, setSecrets] = useState<Row[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [managingEp, setManagingEp] = useState<EnvEndpoint | null>(null);
  const [settingsEp, setSettingsEp] = useState<EnvEndpoint | null>(null);
  const nextId = useRef(0);
  const seededRef = useRef(false);

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  const seed = (config: MiConfig) => {
    setEnvVars(config.envVars.map((e) => ({ id: nextId.current++, key: e.key, value: e.value })));
    setSecrets(config.secrets.map((key) => ({ id: nextId.current++, key, value: '', stored: true })));
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

  const draft: MiConfigDraft = useMemo(
    () => ({
      envVars: envVars.map(({ key, value }) => ({ key: key.trim(), value })),
      secrets: secrets.map(({ key, value }) => ({ key: key.trim(), value })),
    }),
    [envVars, secrets],
  );
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

  const updateRow = (setRows: typeof setEnvVars, id: number, patch: Partial<Row>) => setRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (setRows: typeof setEnvVars, id: number) => setRows((rows) => rows.filter((r) => r.id !== id));
  const addRow = (setRows: typeof setEnvVars) => setRows((rows) => [...rows, { id: nextId.current++, key: '', value: '' }]);

  const configsUrl = navUrl(scope, 'configs-secrets');

  const renderRows = (rows: Row[], setRows: typeof setEnvVars, kind: 'env' | 'secret') =>
    rows.map((r, i) => {
      const keyErr = errorFor(`${kind}:${i}`, r.key);
      return (
        <Stack key={r.id} direction="row" gap={1} alignItems="flex-start">
          <TextField size="small" placeholder="Key" value={r.key} disabled={r.stored} autoComplete="off" onChange={(e) => updateRow(setRows, r.id, { key: e.target.value })} error={!!keyErr} helperText={keyErr || ' '} sx={{ flex: 1 }} />
          <TextField
            size="small"
            placeholder={r.stored ? 'Unchanged' : 'Value'}
            type={kind === 'secret' ? 'password' : 'text'}
            // A key field followed by a password field looks like a login form: without this,
            // a password manager fills in the user's own password and Save stores it as the secret.
            autoComplete={kind === 'secret' ? 'new-password' : 'off'}
            value={r.value}
            onChange={(e) => updateRow(setRows, r.id, { value: e.target.value })}
            helperText={r.stored ? 'Enter a value to replace the secret' : ' '}
            sx={{ flex: 1 }}
          />
          <IconButton size="small" color="error" aria-label={`Remove ${r.key || 'row'}`} onClick={() => removeRow(setRows, r.id)} sx={{ mt: 0.5 }}>
            <Trash2 size={16} />
          </IconButton>
        </Stack>
      );
    });

  const renderSection = (title: string, description: string, rows: Row[], setRows: typeof setEnvVars, kind: 'env' | 'secret', addLabel: string) => (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {description}
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          None added.
        </Typography>
      ) : (
        renderRows(rows, setRows, kind)
      )}
      <Button size="small" startIcon={<Plus size={14} />} onClick={() => addRow(setRows)}>
        {addLabel}
      </Button>
    </Box>
  );

  const renderEndpoints = () => {
    if (managingEp) {
      return <ManageEndpoint ep={managingEp} componentId={componentId} projectId={projectId} versionId={versionId} releaseId={releaseId ?? ''} environmentId={envId} onBack={() => setManagingEp(null)} />;
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
    if (isLoading) {
      return (
        <Stack gap={1.5}>
          {[0, 1, 2].map((i) => (
            <Stack key={i} direction="row" gap={1}>
              <Skeleton variant="rounded" height={40} sx={{ flex: 1 }} />
              <Skeleton variant="rounded" height={40} sx={{ flex: 1 }} />
            </Stack>
          ))}
        </Stack>
      );
    }
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
    return (
      <>
        <Alert severity="info" sx={{ mb: 3 }}>
          The integration reads these as <code>{'${configs.<key>}'}</code>. To mount files, go to{' '}
          {configsUrl ? (
            <Link component={RouterLink} to={configsUrl}>
              Configs &amp; Secrets
            </Link>
          ) : (
            'Configs & Secrets'
          )}
          .
        </Alert>
        {renderSection('Environment Variables', 'Plain values, visible to anyone who can configure the integration.', envVars, setEnvVars, 'env', 'Add Environment Variable')}
        {renderSection('Secrets', 'Stored encrypted. Values cannot be viewed after saving.', secrets, setSecrets, 'secret', 'Add Secret')}
        {showErrors && errors.size > 0 && <Alert severity="error">Fix the highlighted keys before saving.</Alert>}
      </>
    );
  };

  // The last step saves when something changed. With nothing to save it continues the
  // Configure & Deploy flow, closes the Endpoints step (whose edits apply on their own), or waits.
  const finishLabel = save.isPending ? 'Saving…' : hasChanges ? 'Save' : continueWithoutChanges ? 'Continue' : step === 2 ? 'Done' : 'Save';
  const finishDisabled = save.isPending || (!hasChanges && !continueWithoutChanges && step !== 2);
  const showFinish = isDeployed || continueWithoutChanges;

  return (
    <>
      <Drawer anchor="right" open={open} onClose={handleClose} variant="temporary" sx={drawerSx}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="h5">Configurations</Typography>
          <IconButton size="small" aria-label="close" onClick={handleClose}>
            <X size={16} />
          </IconButton>
        </Stack>

        {showEndpoints && <StepIndicator step={step} steps={STEPS} />}

        <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>{step === 1 ? renderContent() : renderEndpoints()}</Box>

        {saveError && (
          <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
            {saveError}
          </Alert>
        )}

        {/* ManageEndpoint has its own Cancel/Update. */}
        {!(step === 2 && managingEp) && (
          <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
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
