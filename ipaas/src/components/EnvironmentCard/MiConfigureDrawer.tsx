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

import { Alert, Box, Button, CircularProgress, DrawerPanel, IconButton, InputAdornment, Link, Skeleton, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { useIntegrationLinks, useLinkWrite } from '../../hooks/useConfiguration';
import { useEnvEndpoints } from '../../hooks/useDeployments';
import { useEnvironments } from '../../hooks/useEnvironments';
import { useMiConfig, useSaveMiConfig } from '../../hooks/useMiConfig';
import { navUrl, useScope } from '../../nav';
import type { EnvEndpoint } from '../../types/component';
import type { MiConfig, MiConfigDraft } from '../../types/envGroups';
import { toEndpointOptions } from '../../utils/endpoints';
import { formLinkView, type TargetView } from '../../utils/integrationLinks';
import { isEmptyMiConfigSavePlan, MI_ENV_VARS_GROUP, MI_SECRETS_GROUP, planMiConfigSave, validateMiConfigDraft } from '../../utils/miConfigs';
import { EndpointCardList } from '../EndpointCardList';
import { FieldLinkPicker } from '../SchemaConfigForm/FieldLinkPicker';
import { fromText } from '../SchemaConfigForm/linkedFrom';
import ApiSettingsDrawer from '../Overview/integration-as-api/ApiSettingsDrawer';
import { ManageEndpoint, StepIndicator } from './ConfigureSteps';
import { useLeaveGuard, useUnsavedChanges } from '../../contexts/UnsavedChangesContext';

// No Certificate Mount step, unlike ConfigureDrawer: certificate mounts are not wired
// to the BFF yet (api/configuration.ts reads none and saves nothing), so it would be empty.
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
  const linksRead = useIntegrationLinks(projectId, componentId, open);
  const links = linksRead.data;
  const linkWrite = useLinkWrite();
  // Until the links read, rows can't be told linked or not; while a write is on its way, another could undo it.
  const linksUnread = !links || linksRead.isError;
  const linkBusy = linkWrite.isPending || linksUnread;
  const { data: environments = [] } = useEnvironments('', projectId);
  const envName = (id = '') => environments.find((e) => e.id === id)?.name ?? id;
  const linkView = useMemo(() => links && formLinkView(links, envId), [links, envId]);
  const linkOf = (name: string): TargetView => (name && linkView ? linkView.target(name) : {});
  // Links apply to all environments: a linked name the form has no value for still gets a row; so does a declared one.
  // The first environment edits the current links; another lists what its release runs.
  const linkedNames = useMemo(() => Object.keys((linkView?.editable ? (links?.sourceDefined ? links.declared : links?.env) : links?.environments.find((e) => e.name === envId)?.env) ?? {}), [linkView, links, envId]);
  const linkedOnly = linkedNames.filter((n) => ![...envVars, ...secrets].some((r) => r.key.trim() === n));

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
    if (data && !seededRef.current) seed(data);
  }, [open, data]);

  // Back to the first step, with no errors, on open. Not on data refetches: those
  // would move the user mid-edit, and the refetch after a partly failed save would
  // clear the error that says what was saved.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setManagingEp(null);
    setShowErrors(false);
    setSaveError(null);
  }, [open]);

  const named: MiConfigDraft = useMemo(
    () => ({
      envVars: envVars.map(({ key, value }) => ({ key: key.trim(), value })),
      secrets: secrets.map(({ key, value }) => ({ key: key.trim(), value })),
    }),
    [envVars, secrets],
  );
  // A linked name needs no value of its own; one it has, stored or typed, stays for when the link goes.
  const draft = useMemo(() => {
    const stored = new Map(data?.envVars.map((e) => [e.key, e.value]));
    const envVars = named.envVars.flatMap((e) => (e.value !== '' || !linkedNames.includes(e.key) ? [e] : stored.has(e.key) ? [{ key: e.key, value: stored.get(e.key)! }] : []));
    return { ...named, envVars };
  }, [named, linkedNames, data]);
  // From the latest fetch, not the rows seeded on open: a secret removed elsewhere since
  // (e.g. on Configs & Secrets) has no value to keep, so its row needs a new one.
  const storedSecrets = useMemo(() => {
    const current = new Set(data?.secrets ?? []);
    return [...secrets.filter((s) => s.stored && current.has(s.key)).map((s) => s.key), ...linkedNames];
  }, [secrets, data, linkedNames]);
  // Rows hidden because their group is of the wrong kind are never saved, so they are not validated.
  const envVarsHidden = !!data?.envVarsGroupIsSecret;
  const secretsHidden = !!data?.secretsGroupIsPlain;
  const errors = useMemo(() => validateMiConfigDraft({ envVars: envVarsHidden ? [] : named.envVars, secrets: secretsHidden ? [] : named.secrets }, storedSecrets, data), [named, storedSecrets, data, envVarsHidden, secretsHidden]);
  const plan = useMemo(() => (data ? planMiConfigSave(data, draft) : null), [data, draft]);
  const hasChanges = !!plan && !isEmptyMiConfigSavePlan(plan);
  useUnsavedChanges(open && hasChanges);
  const guardNavigation = useLeaveGuard();
  const requestClose = () => guardNavigation(handleClose);

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
        handleClose();
        onSaved?.();
      },
      onError: (err) => setSaveError(err instanceof Error ? err.message : 'Failed to save the configurations.'),
    });
  };

  const updateRow = (setRows: typeof setEnvVars, id: number, patch: Partial<Row>) => setRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (setRows: typeof setEnvVars, id: number) => setRows((rows) => rows.filter((r) => r.id !== id));
  const addRow = (setRows: typeof setEnvVars) => setRows((rows) => [...rows, { id: nextId.current++, key: '', value: '' }]);

  const configsUrl = navUrl(scope, 'configs-secrets');

  const link = (env: string, pick: { resource: string; key: string } | null) => linkWrite.mutate({ projectId, componentId, target: pick ? { env, ref: pick.resource, key: pick.key } : { env } });

  // The value box's link icon: Enter a value, or a resource key.
  const renderValue = (name: string, view: TargetView, box: JSX.Element) => {
    // An MI integration's env vars take resource keys only, which these two make true: the list is
    // emptied so none is offered, and a pick carrying one is dropped rather than written.
    // An MI env var takes a resource key only: both endpoint groups are emptied so none is offered,
    // and a pick carrying one is dropped rather than taken for an unlink.
    const picker = view.picker && name && (
      <FieldLinkPicker
        field={name}
        picker={{ ...view.picker, endpoints: [], connections: [], disabled: linkBusy, onPick: (pick) => (pick && 'endpoint' in pick ? undefined : link(name, pick)) }}
      />
    );
    if (!view.source)
      return picker ? (
        <Stack direction="row" alignItems="flex-start" sx={{ flex: 1 }}>
          {box}
          <Box sx={{ mt: 0.75 }}>{picker}</Box>
        </Stack>
      ) : (
        box
      );
    return (
      <Box sx={{ flex: 1 }}>
        <TextField
          fullWidth
          size="small"
          disabled
          value={fromText({ resource: view.source.name, key: view.source.key, declared: view.source.declared })}
          inputProps={{ 'aria-label': `${name} is supplied by ${view.source.name}` }}
          InputProps={{ endAdornment: picker && <InputAdornment position="end">{picker}</InputAdornment> }}
        />
        {view.source.noValues && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
            No {envName(envId)} values. Add them in WSO2 Cloud.
          </Typography>
        )}
      </Box>
    );
  };

  const renderRows = (rows: Row[], setRows: typeof setEnvVars, kind: 'env' | 'secret') =>
    rows.map((r, i) => {
      const keyErr = errorFor(`${kind}:${i}`, r.key);
      const name = r.key.trim();
      const rowLink = keyErr ? {} : linkOf(name);
      return (
        <Stack key={r.id} direction="row" gap={1} alignItems="flex-start">
          <TextField size="small" placeholder="Key" value={r.key} disabled={r.stored} autoComplete="off" onChange={(e) => updateRow(setRows, r.id, { key: e.target.value })} error={!!keyErr} helperText={keyErr || ' '} sx={{ flex: 1 }} />
          {renderValue(
            name,
            rowLink,
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
            />,
          )}
          <IconButton
            size="small"
            color="error"
            aria-label={`Remove ${r.key || 'row'}`}
            disabled={!!rowLink.source && (!rowLink.picker || linkBusy)}
            onClick={() => {
              if (rowLink.source) link(name, null);
              removeRow(setRows, r.id);
            }}
            sx={{ mt: 0.5 }}>
            <Trash2 size={16} />
          </IconButton>
        </Stack>
      );
    });

  const renderLinkedOnly = () =>
    linkedOnly.map((name) => {
      const l = linkOf(name);
      return (
        <Stack key={name} direction="row" gap={1} alignItems="flex-start" sx={{ mb: 2.5 }}>
          <TextField size="small" value={name} disabled sx={{ flex: 1 }} />
          {renderValue(name, l, <></>)}
          <IconButton size="small" color="error" aria-label={`Remove ${name}`} disabled={!l.picker || linkBusy} onClick={() => link(name, null)} sx={{ mt: 0.5 }}>
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
      {kind === 'env' && renderLinkedOnly()}
      {rows.length === 0 && (kind === 'secret' || linkedOnly.length === 0) ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          None added.
        </Typography>
      ) : (
        renderRows(rows, setRows, kind)
      )}
      <Button size="small" startIcon={<Plus size={14} />} onClick={() => addRow(setRows)}>
        {addLabel}
      </Button>
      {kind === 'env' && !linkView?.sourceDefined && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {linkView?.editable === false ? `Links apply to all environments. Change links in ${envName(links?.environments[0]?.name)}.` : 'Links apply to all environments; values are per environment.'}
        </Typography>
      )}
      {kind === 'env' && linkWrite.isError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {linkWrite.error instanceof Error ? linkWrite.error.message : "Linking didn't finish."}
        </Alert>
      )}
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
    return <EndpointCardList endpoints={endpoints} projectId={projectId} envId={envId} onEdit={setManagingEp} onSettings={setSettingsEp} />;
  };

  const renderContent = () => {
    if (!isDeployed) {
      return <Alert severity="info">{continueWithoutChanges ? 'Configurations can be set once the integration is deployed to this environment. Continue to deploy it.' : 'Deploy the integration to this environment to set its configurations.'}</Alert>;
    }
    if (isLoading || linksRead.isLoading) {
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
    const linksError = linksRead.isError && (
      <Alert
        severity="error"
        sx={{ mb: 3 }}
        action={
          <Button color="inherit" size="small" disabled={linksRead.isFetching} onClick={() => void linksRead.refetch()}>
            Try again
          </Button>
        }>
        {links ? "Couldn't refresh this integration's links. These are from the last read." : "Couldn't read this integration's links."}
      </Alert>
    );
    // Without the links, linked rows would read as rows without values.
    if (!links) return linksError;
    return (
      <>
        {linksError}
        <Alert severity="info" sx={{ mb: 3 }}>
          The integration reads these as <code>{'${configs.<key>}'}</code>. To mount files, go to{' '}
          {configsUrl ? (
            <Link component={RouterLink} to={configsUrl}>
              Configs &amp; secrets
            </Link>
          ) : (
            'Configs & secrets'
          )}
          .
        </Alert>
        {linkView?.sourceDefined && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Links come from workload.yaml in the repository.
          </Typography>
        )}
        {data.envVarsGroupIsSecret ? (
          // Its values can't be read back, and saving variables here would replace them.
          <Alert severity="warning" sx={{ mb: 3 }}>
            Environment variables can't be edited here: the <code>{MI_ENV_VARS_GROUP}</code> group on Configs &amp; secrets is stored as a secret. Edit or delete that group there first.
          </Alert>
        ) : (
          renderSection('Environment variables', 'Plain values, visible to anyone who can configure the integration.', envVars, setEnvVars, 'env', 'Add environment variable')
        )}
        {data.secretsGroupIsPlain ? (
          // Saving secrets here would turn that group into a secret one and drop its values.
          <Alert severity="warning" sx={{ mb: 3 }}>
            Secrets can&apos;t be edited here: the <code>{MI_SECRETS_GROUP}</code> group on Configs &amp; secrets is not stored as a secret. Edit or delete that group there first.
          </Alert>
        ) : (
          renderSection('Secrets', 'Stored encrypted. Values cannot be viewed after saving.', secrets, setSecrets, 'secret', 'Add secret')
        )}
        {showErrors && errors.size > 0 && <Alert severity="error">Fix the highlighted keys before saving.</Alert>}
      </>
    );
  };

  // The last step saves when something changed. With nothing to save it continues the
  // Configure & Deploy flow, closes the Endpoints step (whose edits apply on their own), or waits.
  const finishLabel = save.isPending ? 'Saving…' : hasChanges ? 'Save' : continueWithoutChanges ? 'Continue' : step === 2 ? 'Done' : 'Save';
  const finishDisabled = save.isPending || (isDeployed && linksUnread) || (!hasChanges && !continueWithoutChanges && step !== 2);
  const showFinish = isDeployed || continueWithoutChanges;

  return (
    <>
      <DrawerPanel open={open} onClose={requestClose}>
        <DrawerPanel.Header>
          <DrawerPanel.Title>Configurations</DrawerPanel.Title>
          <DrawerPanel.Actions>
            <DrawerPanel.CloseButton />
          </DrawerPanel.Actions>
        </DrawerPanel.Header>

        {showEndpoints && <StepIndicator step={step} steps={STEPS} />}

        <DrawerPanel.Body>{step === 1 ? renderContent() : renderEndpoints()}</DrawerPanel.Body>

        {saveError && (
          <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
            {saveError}
          </Alert>
        )}

        {/* ManageEndpoint has its own Cancel/Update. */}
        {!(step === 2 && managingEp) && (
          <DrawerPanel.Footer>
            <Button variant="outlined" color="inherit" onClick={step === 2 ? () => setStep(1) : requestClose}>
              {step === 2 ? 'Back' : 'Cancel'}
            </Button>
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
          </DrawerPanel.Footer>
        )}
      </DrawerPanel>

      {showEndpoints && <ApiSettingsDrawer open={settingsEp !== null} onClose={() => setSettingsEp(null)} componentName={componentId} envName={envId} deploymentTrackId={versionId} endpoints={toEndpointOptions(endpoints)} activeEndpointName={settingsEp?.id} />}
    </>
  );
}
