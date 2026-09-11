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

import { Alert, Button, Checkbox, Chip, CircularProgress, Divider, FormControlLabel, IconButton, ListItemText, MenuItem, PageContent, Select, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ChevronDown, ChevronRight, Copy, Download, RefreshCw, ScrollText, X } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Link } from 'react-router';
import { useProjectByHandler, useComponentByHandler, useComponents, useEnvironments, useRuntimes, useComponentRuntimes, useComponentRuntimesByEnvironments, useProjectRuntimes, useProjectRuntimesByEnvironments } from '../api/queries';
import { useInfiniteLogs, type LogRow, type LogsRequest } from '../api/logs';
import { useMoesifLogsConfig, useCreateMoesifLogsDashboards, useMoesifLogsEmbed } from '../api/logsMoesif';
import { isMoesifEnabled } from '../config/api';
import { downloadMoesifBiLogsFluentBitFiles } from '../assets/moesifBiLogs';
import { downloadMoesifMiLogsFluentBitFiles } from '../assets/moesifMiLogs';
import { getMoesifLogsCanvasTemplate } from '../assets/moesifLogsCanvasTemplate';
import CodeBoxWithCopy from '../components/CodeBoxWithCopy';
import MoesifCanvas from '../components/MoesifCanvas';
import { runtimeOptionLabel } from '../utils/moesifRuntimeOptions';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import SearchField from '../components/SearchField';
import { resourceUrl, broaden, hasComponent, type ProjectScope, type ComponentScope } from '../nav';
import { MOESIF_DESCRIPTION, MOESIF_SETUP_GUIDE, OPENSEARCH_SETUP_GUIDE_DEFAULT, OPENSEARCH_SETUP_GUIDE_MI, MoesifStep } from '../components/MoesifSetup';

const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG'] as const;

// value in hours; 'custom' handled separately
const TIME_PRESETS: { label: string; hours: number }[] = [
  { label: 'Past 10 minutes', hours: 1 / 6 },
  { label: 'Past 30 minutes', hours: 0.5 },
  { label: 'Past 1 hour', hours: 1 },
  { label: 'Past 24 hours', hours: 24 },
  { label: 'Past 7 days', hours: 168 },
  { label: 'Past 30 days', hours: 720 },
];
const DEFAULT_HOURS = 720; // 30 days fallback when filter cleared
const AUTO_FETCH_INTERVAL = 10_000;
const PAGE_SIZE = 500;

const LEVEL_COLORS: Record<string, string> = { ERROR: '#e53935', WARN: '#f9a825', INFO: '#1e88e5', DEBUG: '#78909c' };

// WSO2 MI Moesif logs setup guide, linked from the MI logs setup instructions
// for further guidance (the MI flow uses a Fluent Bit sidecar to ship
// wso2carbon.log to Moesif's OTLP endpoint).
const MI_MOESIF_LOGS_GUIDE = 'https://mi.docs.wso2.com/en/latest/observe-and-manage/classic-observability-logs/moesif-logs/';

// BI (Ballerina) log-to-file configuration. The BI application reads logs from
// this file for observability, so the runtime is configured to emit JSON logs to
// a file destination.
const BI_LOG_FILE_CONFIG_TOML = `[ballerina.log]
format = "json"

[[ballerina.log.destinations]]
# Replace /path/to/your/bi/logs with the absolute path to the BI application's log directory
path = "/path/to/your/bi/logs/app.log"`;

// BI (Ballerina) "publish logs" instructions: write JSON logs to a file via
// Config.toml, then run the Fluent Bit sidecar that tails that file and ships
// the entries to Moesif's OTLP endpoint.
function BiLogsPublishInstructions(): JSX.Element {
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Write JSON logs to a file by adding this to your runtime's <strong>Config.toml</strong>:
      </Typography>
      <CodeBoxWithCopy code={BI_LOG_FILE_CONFIG_TOML} />
      <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
        <strong>Restart the runtime</strong> after applying this configuration.
      </Alert>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Download the Fluent Bit bundle, set the Collector Application ID, service name, environment and BI log directory in <strong>.env</strong>, then run <strong>docker compose up -d</strong>. The runtime emits <strong>icp.runtimeId</strong> in each JSON log
        line, which Fluent Bit forwards as a queryable log attribute for dashboard filtering. On Windows, use a Windows-style path and enable the drive under Docker Desktop file sharing.
      </Typography>
      <Button size="small" variant="outlined" startIcon={<Download size={14} />} onClick={() => downloadMoesifBiLogsFluentBitFiles('<MOESIF_COLLECTOR_APPLICATION_ID>')} sx={{ mt: 1, alignSelf: 'flex-start', py: 0.25, px: 1, fontSize: 12 }}>
        Download Fluent Bit config
      </Button>
    </>
  );
}

// MI (Micro Integrator) "publish logs" instructions. MI already writes its
// server logs to <MI_HOME>/repository/logs/wso2carbon.log by default, so no
// MI-side configuration change is needed. A Fluent Bit sidecar
// tails that file and ships the entries to Moesif's OTLP logs endpoint. The user
// downloads the Fluent Bit bundle, sets the Collector Application ID + MI_HOME in
// .env, then runs docker compose up -d. See the WSO2 MI Moesif logs guide for
// further details.
function MiLogsPublishInstructions(): JSX.Element {
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        MI writes its server logs to <strong>&lt;MI_HOME&gt;/repository/logs/wso2carbon.log</strong> by default, so no runtime configuration change is needed. A <strong>Fluent Bit</strong> sidecar tails that file and ships the entries to Moesif.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1, mt: 2 }}>
        Download the Fluent Bit bundle, set the Collector Application ID, <strong>ICP_RUNTIME_ID</strong> (the runtime whose logs this sidecar ships — the logs dashboard filters by it) and <strong>MI_HOME</strong> in <strong>.env</strong>, then run{' '}
        <strong>docker compose up -d</strong> to publish logs to Moesif. On Windows, use a Windows-style path and enable the drive under Docker Desktop file sharing.
      </Typography>
      <Button size="small" variant="outlined" startIcon={<Download size={14} />} onClick={() => downloadMoesifMiLogsFluentBitFiles('<MOESIF_COLLECTOR_APPLICATION_ID>')} sx={{ mt: 1, alignSelf: 'flex-start', py: 0.25, px: 1, fontSize: 12 }}>
        Download Fluent Bit config
      </Button>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        For further guidance, refer the{' '}
        <a href={MI_MOESIF_LOGS_GUIDE} target="_blank" rel="noreferrer">
          WSO2 MI Moesif logs documentation
        </a>
        .
      </Typography>
    </>
  );
}

// Setup instructions shown when no logs observability backend is configured.
// Mirrors the metrics setup structure: Moesif is offered first (when enabled)
// with the main steps from the observability user story rendered as collapsible
// sections, followed by OpenSearch as an alternative. When Moesif is disabled
// only the OpenSearch section is shown. Step 02 differs by runtime technology:
// BI writes JSON logs to a file that a Fluent Bit sidecar ships to Moesif, while
// MI ships its default wso2carbon.log via a Fluent Bit sidecar.
function LogsSetupInstructions({
  isMI,
  showBothTechnologies,
  showBackendNotice,
  moesifFormSlot,
  configured,
}: {
  isMI?: boolean;
  showBothTechnologies?: boolean;
  // Whether it is already established that no backend is configured. Suppressed
  // while the Moesif config query is still in flight so the notice never flashes
  // on a linked integration on its way to the canvas.
  showBackendNotice?: boolean;
  moesifFormSlot?: JSX.Element;
  // Rendered from the "View Configurations" action on an already-linked
  // environment rather than as the initial setup flow: the canvas is shared by
  // every integration in the environment, so this is how a user checks the
  // runtime publishing configuration when the canvas shows no data. Step 02 (the
  // usual omission) opens expanded, the OpenSearch alternative is dropped and
  // step 03 is framed as a credential update.
  configured?: boolean;
}): JSX.Element {
  const moesifEnabled = isMoesifEnabled();
  const opensearchGuide = isMI ? OPENSEARCH_SETUP_GUIDE_MI : OPENSEARCH_SETUP_GUIDE_DEFAULT;

  return (
    <Stack sx={{ width: '100%', textAlign: 'left' }}>
      {/* Neither backend is usable yet (OpenSearch unreachable and no linked
          Moesif canvas), so say what has to be set up before the logs view
          works. Lives here rather than on the page so it disappears as soon as
          the Moesif canvas is linked — matching the metrics view, which shows
          the same notice only while its dashboard is unlinked. */}
      {showBackendNotice && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          To enable the logs view you need to setup observability with either Moesif or OpenSearch. Refer the documentation{' '}
          <a href={OPENSEARCH_SETUP_GUIDE_DEFAULT} target="_blank" rel="noreferrer">
            {OPENSEARCH_SETUP_GUIDE_DEFAULT}
          </a>{' '}
          for details.
        </Typography>
      )}
      {moesifEnabled && (
        <>
          <Typography variant="h4" sx={{ mb: 1, color: 'warning.main' }}>
            {configured ? 'Moesif logs configurations' : 'Configure logs with Moesif'}
          </Typography>
          {configured && (
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              The Moesif canvas is linked for this environment and is shared by every integration in it, so the dashboard loads even for an integration that was never configured to publish logs. Follow the steps below to configure this integration's runtime,
              or update the stored Management API Key in Step 03.
            </Typography>
          )}
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            <strong>Moesif</strong>
            {MOESIF_DESCRIPTION}{' '}
            <a href={MOESIF_SETUP_GUIDE} target="_blank" rel="noreferrer">
              View the setup guide
            </a>
            .
          </Typography>

          {/* Step 1: prepare Moesif for the environment. */}
          <MoesifStep title="Step 01: Prepare Moesif" defaultExpanded={!configured}>
            <Typography variant="body2" color="text.secondary">
              Using{' '}
              <a href="https://www.moesif.com/wrap/basic" target="_blank" rel="noreferrer">
                Moesif Basic
              </a>
              , create one application per ICP environment you want to track and copy its <strong>Collector Application ID</strong>.
            </Typography>
          </MoesifStep>

          {/* Step 2: configure the runtime to write + publish logs to Moesif.
              BI writes JSON logs to a file shipped by Fluent Bit; MI ships its
              default wso2carbon.log via a Fluent Bit sidecar. */}
          <MoesifStep title="Step 02: Publish logs from your runtime" defaultExpanded={configured}>
            {showBothTechnologies ? (
              /* All integrations in view and the project mixes technologies, so
                 both sidecar flows are shown rather than guessing one. */
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  WSO2 Integrator: BI runtimes
                </Typography>
                <BiLogsPublishInstructions />
                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  WSO2 Integrator: MI runtimes
                </Typography>
                <MiLogsPublishInstructions />
              </>
            ) : isMI ? (
              <MiLogsPublishInstructions />
            ) : (
              <BiLogsPublishInstructions />
            )}
          </MoesifStep>

          {/* Step 3: link the canvas with a Management API Key (rendered only when
              an integration + environment are resolved so the mutation has a target). */}
          {moesifFormSlot && <MoesifStep title={configured ? 'Step 03: Update the canvas credentials' : 'Step 03: Load the dashboard'}>{moesifFormSlot}</MoesifStep>}
        </>
      )}

      {!configured && (
        <>
          <Typography variant="h4" sx={{ mt: moesifEnabled ? 4 : 0, mb: 2, color: 'warning.main' }}>
            Configure logs with OpenSearch
          </Typography>
          <Typography color="text.secondary">
            Follow the guide to setup observability with OpenSearch :{' '}
            <a href={opensearchGuide} target="_blank" rel="noreferrer">
              {opensearchGuide}
            </a>
          </Typography>
        </>
      )}
    </Stack>
  );
}

// Credential form to link an integration's Moesif logs canvas. Mirrors the
// metrics MoesifDashboardCard: the user supplies a Moesif Management API Key
// (a JWT the backend derives the org + app ids from), then the backend persists
// the shared canvas credentials and flips the `logsConfigured` flag. The canvas
// auth token is minted on demand by the backend from this key, so no separate
// canvas token is entered here. The Management API Key is treated as a secret.
function MoesifLogsCredentialForm({ onCreate, creating, error }: { onCreate: (managementApiKey: string) => void; creating: boolean; error: unknown }): JSX.Element {
  const [managementApiKey, setManagementApiKey] = useState('');
  const trimmedManagementApiKey = managementApiKey.trim();

  return (
    <Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Once logs are flowing to Moesif, create a <strong>Management API Key</strong> with the <strong>access_tokens: create</strong> and <strong>events: read</strong> scopes, then paste it below to load the logs dashboard. The Organization ID, Application ID
        and a short-lived canvas token are derived from it. Treated as a secret; never stored in the browser.
      </Typography>
      <Stack sx={{ maxWidth: 640 }}>
        <TextField label="Management API Key" placeholder="Paste your Moesif Management API Key" value={managementApiKey} onChange={(e) => setManagementApiKey(e.target.value)} type="password" fullWidth size="small" sx={{ mb: 2 }} autoComplete="off" />
        {!!error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(error as Error).message || 'Failed to link the Moesif logs canvas.'}
          </Alert>
        )}
        <Button variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={!trimmedManagementApiKey || creating} onClick={() => onCreate(trimmedManagementApiKey)}>
          {creating ? 'Linking…' : 'Link canvas'}
        </Button>
      </Stack>
    </Stack>
  );
}

// Renders the embedded Moesif logs canvas for a linked integration. Fetches the
// canvas embed URL + auth token from the backend and drives the same iframe
// postMessage handshake as the metrics canvas, but posts the application logs
// canvas template (getMoesifLogsCanvasTemplate) instead of the metrics one. The
// canvas is scoped to this integration's runtimes via the `runtimeId` context
// filter. A "View Configurations" action reopens the setup instructions (and the
// credential update form) for the linked environment.
function MoesifLogsCanvasView({
  componentId,
  environmentId,
  projectId,
  isMI,
  allIntegrations,
  onEdit,
}: {
  componentId: string;
  environmentId: string;
  projectId: string;
  isMI: boolean;
  // Project scope with "All Integrations" selected: the canvas covers every
  // integration in the project, so the runtime filter is built from all of the
  // project's runtimes rather than one integration's.
  allIntegrations: boolean;
  onEdit: () => void;
}): JSX.Element {
  const { data: embed, isLoading: loadingEmbed, isFetching: fetchingEmbed, error: embedError, refetch: refetchEmbed } = useMoesifLogsEmbed(componentId || undefined, environmentId || undefined, true);
  const { data: runtimes = [] } = useComponentRuntimes(environmentId, projectId, componentId, !allIntegrations);
  const { data: projectRuntimes = [] } = useProjectRuntimes(environmentId, projectId, allIntegrations);
  // Runtime filter options for the canvas' `runtimeId` context filter. Labels are
  // prefixed with the owning integration — "integration1 (runtime1)" — in both
  // scopes, so a runtime reads the same whether the list covers one integration
  // or every integration in the project.
  const runtimeOptions = useMemo(() => (allIntegrations ? projectRuntimes : runtimes).map((r) => ({ label: runtimeOptionLabel(r), value: r.runtimeId })), [allIntegrations, projectRuntimes, runtimes]);
  const logsTemplate = useMemo(() => getMoesifLogsCanvasTemplate(), []);

  return (
    <Stack sx={{ width: '100%' }}>
      <Stack direction="row" gap={2} sx={{ mb: 2 }} justifyContent="flex-end" alignItems="center">
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" aria-label="Refresh logs canvas" onClick={() => refetchEmbed()} disabled={fetchingEmbed}>
              <RefreshCw size={18} />
            </IconButton>
          </span>
        </Tooltip>
        <Button variant="outlined" size="small" onClick={onEdit}>
          View Configurations
        </Button>
      </Stack>
      {loadingEmbed ? (
        <CircularProgress size={28} sx={{ display: 'block', mx: 'auto', my: 6 }} />
      ) : embedError ? (
        <Stack alignItems="center" gap={2} sx={{ py: 6 }}>
          <Alert
            severity="error"
            sx={{ width: '100%', maxWidth: 720 }}
            action={
              <Button color="inherit" size="small" onClick={() => refetchEmbed()} disabled={fetchingEmbed}>
                Retry
              </Button>
            }>
            {(embedError as Error).message || 'Failed to load the Moesif logs dashboard.'}
          </Alert>
        </Stack>
      ) : embed ? (
        <MoesifCanvas key={`${environmentId}:${embed.embedUrl}`} embedUrl={embed.embedUrl} token={embed.token} isMI={isMI} runtimeIds={runtimeOptions} onRefreshToken={() => refetchEmbed()} template={logsTemplate} />
      ) : (
        <CircularProgress size={28} sx={{ display: 'block', mx: 'auto', my: 6 }} />
      )}
    </Stack>
  );
}

// Moesif logs experience for the "observability unavailable" state of the logs
// view. Reads whether the integration's Moesif logs canvas is linked and either
// (a) shows the embedded logs canvas, or (b) shows the logs setup instructions
// with the credential form. Falls back to the plain instructions (no form) when
// an integration/environment isn't resolved or Moesif is disabled.
function MoesifLogsSection({
  componentId,
  environmentId,
  projectId,
  isMI,
  allIntegrations,
  showBothTechnologies,
  perRuntimeLogsHint,
}: {
  componentId: string | undefined;
  environmentId: string | undefined;
  projectId: string;
  isMI: boolean;
  // True at project scope with "All Integrations" selected: `componentId` is then
  // only a stand-in used to authorize the config/embed requests (the Moesif
  // credentials are stored per environment and shared by every integration in
  // it), and the canvas is filtered by every project runtime instead.
  allIntegrations: boolean;
  // Render both the BI and MI "publish logs" instructions instead of picking one
  // (all integrations in view and the project mixes technologies).
  showBothTechnologies: boolean;
  // Link to the per-runtime log downloads, shown with the setup instructions as
  // an interim way to read MI logs. Deliberately not rendered above the canvas:
  // once the canvas is linked the logs are right there.
  perRuntimeLogsHint?: JSX.Element;
}): JSX.Element {
  // Whether the "View Configurations" view is open on a linked environment (the
  // setup instructions + credential update form instead of the canvas).
  const [editing, setEditing] = useState(false);
  const moesifEnabled = isMoesifEnabled();
  const canQuery = moesifEnabled && !!componentId && !!environmentId;
  const { data: logsConfig, isLoading: loadingConfig } = useMoesifLogsConfig(canQuery ? componentId : undefined, canQuery ? environmentId : undefined);
  const createLogs = useCreateMoesifLogsDashboards();
  const logsConfigured = !!logsConfig?.logsConfigured;

  // The credential form is wired whenever we have a concrete target
  // (integration + environment) for the mutation, independent of the config
  // query state. This keeps step 4 visible while the config is still loading
  // and when Moesif is enabled but the integration is not yet linked.
  const formSlot =
    moesifEnabled && componentId && environmentId ? <MoesifLogsCredentialForm creating={createLogs.isPending} error={createLogs.error} onCreate={(managementApiKey) => createLogs.mutate({ componentId, environmentId, managementApiKey })} /> : undefined;

  // Resolving the logs config: show the instructions (with the credential form
  // when a target is available) while it loads so the page isn't blank and
  // step 4 doesn't disappear (the config only gates the embedded-canvas vs.
  // form choice).
  if (canQuery && loadingConfig) {
    return (
      <>
        {perRuntimeLogsHint}
        <LogsSetupInstructions isMI={isMI} showBothTechnologies={showBothTechnologies} moesifFormSlot={formSlot} />
      </>
    );
  }

  // Linked, and the user opened "View Configurations": show the same setup
  // instructions as the unlinked state so the runtime publishing configuration
  // can be checked after the fact (the credentials are per environment and
  // shared, so the canvas renders for integrations that never published a log
  // line), with step 03 re-linking the canvas with new credentials.
  if (logsConfigured && editing && componentId && environmentId) {
    return (
      <Stack sx={{ width: '100%', textAlign: 'left' }}>
        <Button variant="outlined" size="small" startIcon={<ArrowLeft size={16} />} sx={{ alignSelf: 'flex-start', mb: 2 }} onClick={() => setEditing(false)} disabled={createLogs.isPending}>
          Back to logs canvas
        </Button>
        <LogsSetupInstructions
          isMI={isMI}
          showBothTechnologies={showBothTechnologies}
          configured
          moesifFormSlot={<MoesifLogsCredentialForm creating={createLogs.isPending} error={createLogs.error} onCreate={(managementApiKey) => createLogs.mutate({ componentId, environmentId, managementApiKey }, { onSuccess: () => setEditing(false) })} />}
        />
      </Stack>
    );
  }

  // Linked: render the embedded logs canvas.
  if (logsConfigured && componentId && environmentId) {
    return <MoesifLogsCanvasView componentId={componentId} environmentId={environmentId} projectId={projectId} isMI={isMI} allIntegrations={allIntegrations} onEdit={() => setEditing(true)} />;
  }

  // Not linked (or no target resolved): show the setup instructions, with the
  // credential form embedded when a target is available.
  return (
    <>
      {perRuntimeLogsHint}
      <LogsSetupInstructions isMI={isMI} showBothTechnologies={showBothTechnologies} showBackendNotice moesifFormSlot={formSlot} />
    </>
  );
}

const DISPLAY_FIELDS: { key: keyof LogRow; label: string }[] = [
  { key: 'timestamp', label: 'Timestamp' },
  { key: 'level', label: 'Log Level' },
  { key: 'logLine', label: 'Log Entry' },
  { key: 'class', label: 'Class' },
  { key: 'logFilePath', label: 'Log File Path' },
  { key: 'appName', label: 'App Name' },
  { key: 'module', label: 'Module' },
  { key: 'serviceType', label: 'Service Type' },
  { key: 'app', label: 'App' },
  { key: 'deployment', label: 'Deployment' },
  { key: 'artifactContainer', label: 'Artifact Container' },
  { key: 'product', label: 'Product' },
  { key: 'icpRuntimeId', label: 'Runtime ID' },
  { key: 'logAttributes', label: 'Log Attributes' },
  { key: 'componentVersion', label: 'Component Version' },
  { key: 'componentVersionId', label: 'Component Version ID' },
  { key: 'error', label: 'Error' },
];

function levelColor(level: string): string {
  return LEVEL_COLORS[level] ?? '#78909c';
}

function formatValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function copyLog(log: LogRow) {
  const text = `${new Date(log.timestamp).toLocaleString()} [${log.level}] ${log.logLine}`;
  navigator.clipboard.writeText(text);
}

function downloadLogs(logs: LogRow[]) {
  const text = logs.map((l) => `${new Date(l.timestamp).toLocaleString()} [${l.level}] ${l.logLine}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convert a Date to a datetime-local input value (YYYY-MM-DDTHH:MM) */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isUnavailable(error: unknown): boolean {
  if (!error) return false;
  const status = (error as any).status;
  const message = (error as Error).message ?? '';
  return status === 503 || message.includes('Observability service is unavailable') || message.includes('OpenSearch service is unavailable');
}

function LogEntry({ log, expanded, onToggle }: { log: LogRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <Stack
        direction="row"
        alignItems="center"
        onClick={onToggle}
        sx={{
          fontFamily: 'monospace',
          fontSize: 12,
          px: 0.5,
          py: 0.25,
          cursor: 'pointer',
          borderRadius: 1,
          minHeight: 32,
          '&:hover': { bgcolor: 'action.hover' },
          '&:hover .log-actions': { visibility: 'visible' },
        }}>
        <IconButton size="small" aria-label={expanded ? 'Collapse log entry' : 'Expand log entry'} sx={{ p: 0, mr: 0.5 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
        <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, color: levelColor(log.level), whiteSpace: 'nowrap', mr: 1 }}>
          {new Date(log.timestamp).toLocaleString()}
        </Typography>
        <Chip label={log.level} size="small" sx={{ fontFamily: 'monospace', fontSize: 10, height: 18, mr: 1, bgcolor: levelColor(log.level), color: '#fff', fontWeight: 700 }} />
        {log.serviceType && (
          <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap', mr: 1 }}>
            {log.serviceType}
          </Typography>
        )}
        <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {log.logLine}
        </Typography>
        <Stack direction="row" className="log-actions" sx={{ visibility: 'hidden', ml: 1, flexShrink: 0 }}>
          <Tooltip title="Copy">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                copyLog(log);
              }}>
              <Copy size={14} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      {expanded && (
        <Stack sx={{ pl: 5, pb: 1, fontFamily: 'monospace', fontSize: 12, bgcolor: 'background.default', borderRadius: 1, mx: 0.5, mb: 0.5 }}>
          {DISPLAY_FIELDS.map(({ key, label }) => {
            const val = formatValue(log[key]);
            if (!val) return null;
            return (
              <Stack key={key} direction="row" sx={{ borderBottom: '1px solid', borderColor: 'divider', py: 0.5, gap: 2 }}>
                <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, minWidth: 160, flexShrink: 0 }}>
                  {label}
                </Typography>
                <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {key === 'timestamp' ? new Date(val).toLocaleString() : val}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      )}
    </>
  );
}

export default function RuntimeLogs(scope: ProjectScope | ComponentScope): JSX.Element {
  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';
  const { data: singleComponent, isLoading: loadingComponent } = useComponentByHandler(projectId, hasComponent(scope) ? scope.component : undefined);
  const { data: allComponents = [], isLoading: loadingComponents } = useComponents(scope.org, projectId);
  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(projectId);

  const allComponentIds = hasComponent(scope) ? (singleComponent ? [singleComponent.id] : []) : allComponents.map((c) => c.id);

  const [integrationFilter, setIntegrationFilter] = useState('all');
  const [envFilter, setEnvFilter] = useState<string[]>([]);
  const [levelFilter, setLevelFilter] = useState<string[]>([]);
  const [timePreset, setTimePreset] = useState<string>('Past 24 hours');
  const [customStart, setCustomStart] = useState(() => toLocalInput(new Date(Date.now() - 24 * 3600_000)));
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(new Date()));
  const [searchPhrase, setSearchPhrase] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [autoFetch, setAutoFetch] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const componentIds = !hasComponent(scope) && integrationFilter !== 'all' ? [integrationFilter] : allComponentIds;

  // Only offer environments where runtimes are actually registered, matching the
  // metrics view: it is misleading to query logs (or load the Moesif logs canvas)
  // for an environment nothing is deployed to. When a specific integration is
  // targeted (component scope or a chosen integration) that integration's
  // runtimes decide; the aggregate "All Integrations" view uses the project-wide
  // runtimes, so an environment no integration in the project runs in is hidden.
  const runtimeCheckComponentId = hasComponent(scope) ? (singleComponent?.id ?? '') : integrationFilter !== 'all' ? integrationFilter : '';
  const aggregateEnvCheck = !hasComponent(scope) && integrationFilter === 'all';
  const environmentIds = useMemo(() => environments.map((e) => e.id), [environments]);
  const {
    envsWithRuntimes: componentEnvsWithRuntimes,
    isLoading: loadingComponentEnvRuntimes,
    isError: componentEnvRuntimesError,
    refetch: refetchComponentEnvRuntimes,
  } = useComponentRuntimesByEnvironments(projectId, runtimeCheckComponentId, environmentIds, !!runtimeCheckComponentId);
  const { envsWithRuntimes: projectEnvsWithRuntimes, isLoading: loadingProjectEnvRuntimes, isError: projectEnvRuntimesError, refetch: refetchProjectEnvRuntimes } = useProjectRuntimesByEnvironments(projectId, environmentIds, aggregateEnvCheck);
  const envsWithRuntimes = aggregateEnvCheck ? projectEnvsWithRuntimes : componentEnvsWithRuntimes;
  const loadingEnvRuntimes = aggregateEnvCheck ? loadingProjectEnvRuntimes : loadingComponentEnvRuntimes;
  const envRuntimesError = aggregateEnvCheck ? projectEnvRuntimesError : componentEnvRuntimesError;
  const refetchEnvRuntimes = aggregateEnvCheck ? refetchProjectEnvRuntimes : refetchComponentEnvRuntimes;
  const envCheckActive = aggregateEnvCheck || !!runtimeCheckComponentId;
  // Only narrow the environment list once the runtime lookup has resolved. While
  // it is pending (loadingEnvRuntimes) or if it failed (envRuntimesError), keep
  // all environments so we don't hide every environment — a failed lookup should
  // not masquerade as "no runtimes". A successful lookup that returned nothing is
  // a real result, so the list is narrowed to empty rather than falling back to
  // every environment and querying logs the integration doesn't run in.
  const availableEnvironments = envCheckActive && !loadingEnvRuntimes && !envRuntimesError ? environments.filter((e) => envsWithRuntimes.has(e.id)) : environments;
  const availableEnvIds = availableEnvironments.map((e) => e.id);

  // Drop any selected environments that are no longer available (e.g. after
  // switching to an integration that isn't deployed to them) so requests never
  // target an environment without runtimes.
  const effectiveEnvFilter = envFilter.filter((id) => availableEnvIds.includes(id));

  // Calculate selected environments for request logic
  const selectedEnvIds = effectiveEnvFilter.length > 0 ? effectiveEnvFilter : availableEnvIds;
  const selectedEnvs = environments.filter((e) => selectedEnvIds.includes(e.id));
  const primaryEnv = selectedEnvs[0];

  // Derive selected component id from current selection (matching runtimeLinkComponent logic)
  const selectedComponentId = useMemo(() => {
    const isComponentScope = hasComponent(scope);
    if (isComponentScope) return singleComponent?.id ?? '';
    if (integrationFilter !== 'all') return integrationFilter;
    return allComponentIds[0] ?? '';
  }, [scope, singleComponent, integrationFilter, allComponentIds]);

  // Project scope showing every integration ("All Integrations"), which the
  // Moesif logs canvas covers by filtering on all of the project's runtime ids
  // rather than one integration's — mirroring the OpenSearch view, which queries
  // every integration in the project.
  const allIntegrationsSelected = !hasComponent(scope) && integrationFilter === 'all';

  // The integration id the Moesif logs config/embed requests are made against.
  // Those resolvers authorize per integration, while the credentials themselves
  // are stored per environment and shared by every integration in it, so with all
  // integrations in view the first one stands in for the whole project.
  const moesifTargetComponentId = selectedComponentId;

  // The runtime technologies present in the project. With all integrations in
  // view a mixed project needs both sets of "publish logs" instructions, since
  // BI writes JSON logs and MI uses its default wso2carbon.log file.
  const projectTechnologies = useMemo(() => ['BI', 'MI'].filter((technology) => allComponents.some((component) => component.componentType === technology)), [allComponents]);

  // Derive selected environment id from current selection (matching request logic)
  const selectedEnvId = (effectiveEnvFilter.length > 0 ? effectiveEnvFilter[0] : primaryEnv?.id) ?? '';

  // Fetch runtimes to check if they are MI type (for per-runtime log download link)
  const { data: runtimes = [] } = useRuntimes(selectedEnvId, projectId, selectedComponentId);
  const hasMIRuntimes = useMemo(() => runtimes.some((r) => r.runtimeType === 'MI'), [runtimes]);

  // Determine which component to link to for per-runtime logs
  const runtimeLinkComponent = useMemo(() => {
    const isComponentScope = hasComponent(scope);
    if (isComponentScope) return singleComponent;
    if (integrationFilter !== 'all') {
      return allComponents.find((c) => c.id === integrationFilter);
    }
    return undefined;
  }, [scope, singleComponent, integrationFilter, allComponents]);
  const componentIdsKey = componentIds.join(',');
  const envIdsKey = selectedEnvIds.join(',');
  const levelFilterKey = levelFilter.join(',');

  const logsRequest = useMemo<LogsRequest | null>(() => {
    if (componentIds.length === 0 || !primaryEnv) return null;
    let startTime: string;
    let endTime: string;
    if (timePreset === 'custom') {
      startTime = new Date(customStart).toISOString();
      endTime = new Date(customEnd).toISOString();
    } else {
      const preset = TIME_PRESETS.find((p) => p.label === timePreset);
      const hours = preset?.hours ?? DEFAULT_HOURS;
      const now = new Date();
      startTime = new Date(now.getTime() - hours * 3600_000).toISOString();
      endTime = now.toISOString();
    }
    return {
      componentIdList: componentIds,
      environmentId: primaryEnv.id,
      environmentList: selectedEnvIds,
      logLevels: levelFilter,
      startTime,
      endTime,
      limit: PAGE_SIZE,
      sort: sortDir,
      region: 'US',
      searchPhrase,
    };
    // componentIdsKey / envIdsKey / levelFilterKey stabilize array refs (new array every render)
  }, [componentIdsKey, envIdsKey, levelFilterKey, timePreset, customStart, customEnd, searchPhrase, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute fresh startTime/endTime on every call so auto-fetch and manual refresh always
  // query the correct window relative to the current clock, not the stale memoized timestamps.
  const getTimeRange = useCallback(() => {
    if (timePreset === 'custom') {
      return { startTime: new Date(customStart).toISOString(), endTime: new Date(customEnd).toISOString() };
    }
    const preset = TIME_PRESETS.find((p) => p.label === timePreset);
    const hours = preset?.hours ?? DEFAULT_HOURS;
    const now = new Date();
    return { startTime: new Date(now.getTime() - hours * 3600_000).toISOString(), endTime: now.toISOString() };
  }, [timePreset, customStart, customEnd]);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteLogs(logsRequest, autoFetch ? AUTO_FETCH_INTERVAL : false, getTimeRange);

  // Disable auto-fetch when observability service is unavailable
  useEffect(() => {
    if (isUnavailable(error)) {
      setAutoFetch(false);
    }
  }, [error]);

  const logs = useMemo(() => data?.pages.flat() ?? [], [data]);
  // OpenSearch queries are dead in this state, so its own filters (time range,
  // level, search) are disabled. The integration selector is the exception: it
  // also scopes the Moesif logs canvas rendered in this state, so it stays
  // enabled whenever the Moesif backend is available (see the header below).
  const filtersDisabled = isUnavailable(error);
  const moesifEnabled = isMoesifEnabled();

  // A Moesif application maps to a specific environment, so the user picks which
  // environment's logs canvas is viewed/linked. Mirrors the metrics view (see
  // MetricsMoesif): a single-select rendered above the page title, offered
  // whenever an integration and at least one environment are resolved. Only used
  // in the observability-unavailable (Moesif) state — when the logs backend is
  // reachable the filter toolbar carries its own multi-select environment filter,
  // so rendering this one there too would duplicate it. Writes the single choice
  // back into the shared `envFilter` so both surfaces stay in sync.
  const moesifEnvSelector =
    selectedComponentId && availableEnvironments.length > 0 ? (
      <Select value={selectedEnvId} onChange={(e) => setEnvFilter([e.target.value as string])} size="small" sx={{ minWidth: 140 }} inputProps={{ 'aria-label': 'Environment' }}>
        {availableEnvironments.map((e) => (
          <MenuItem key={e.id} value={e.id}>
            {e.name}
          </MenuItem>
        ))}
      </Select>
    ) : null;

  // Project-scope integration filter, laid out like the metrics views: a
  // left-aligned control under the page title in the Moesif state, and the first
  // control of the filter toolbar in the OpenSearch state (mirroring
  // MetricsMoesif and MetricsOpenSearch respectively). "All Integrations" or one
  // integration; it scopes the OpenSearch log query and, when OpenSearch is
  // unavailable, the Moesif logs canvas' runtime filter — so it is only disabled
  // when neither backend can use it.
  const integrationSelector = !hasComponent(scope) ? (
    <Select value={integrationFilter} onChange={(e) => setIntegrationFilter(e.target.value as string)} size="small" sx={{ minWidth: 200 }} inputProps={{ 'aria-label': 'Integration' }} disabled={filtersDisabled && !moesifEnabled}>
      <MenuItem value="all">All Integrations</MenuItem>
      {allComponents.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.displayName || c.name}
        </MenuItem>
      ))}
    </Select>
  ) : null;

  const filteredLogs = logs;

  const toggle = (i: number) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // Infinite scroll: observe the sentinel at the bottom of the list
  const sentinelRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const el = sentinelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + 200) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const loadingContext = hasComponent(scope) ? loadingComponent : loadingComponents;
  if (loadingProject || loadingContext || loadingEnvironments) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }
  if (hasComponent(scope) && !singleComponent) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }
  if (!hasComponent(scope) && allComponents.length === 0) {
    return (
      <PageContent>
        <EmptyListing icon={<ScrollText size={48} />} title="No components" description="Add a component to view runtime logs." />
      </PageContent>
    );
  }
  if (componentIds.length > 0 && environments.length === 0) {
    return (
      <PageContent>
        <EmptyListing icon={<ScrollText size={48} />} title="No environments" description="Configure an environment to view runtime logs." />
      </PageContent>
    );
  }

  return (
    <PageContent>
      {filtersDisabled && moesifEnvSelector && (
        <Stack direction="row" sx={{ mt: 2, mb: 4 }}>
          {moesifEnvSelector}
        </Stack>
      )}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h1">Runtime Logs</Typography>
      </Stack>

      {/* The per-environment runtime lookup failed, so we cannot tell which
          environments have registered runtimes. The selector
          falls back to every environment (see availableEnvironments) and logs
          are still queried, so this is a non-blocking warning rather than the
          blocking error the metrics view shows: the results may include
          environments the integration has no runtimes in. */}
      {envRuntimesError && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => refetchEnvRuntimes()} disabled={loadingEnvRuntimes}>
              Retry
            </Button>
          }>
          Could not verify which environments have registered runtimes. Showing all environments — logs may cover environments nothing is deployed to.
        </Alert>
      )}

      {/* The lookup succeeded and returned no environments, so the selection is
          genuinely empty rather than unknown: no logs are queried, so say why
          instead of leaving an empty environment selector. */}
      {envCheckActive && !loadingEnvRuntimes && !envRuntimesError && availableEnvironments.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No runtimes are registered for this integration in any environment, so there are no logs to show.
        </Alert>
      )}

      {/* Moesif state: the integration filter sits on its own row under the
          title, as on the Moesif metrics view. With the OpenSearch backend
          reachable it joins the filter toolbar below instead. */}
      {filtersDisabled && integrationSelector && (
        <Stack direction="row" gap={2} sx={{ mb: 3 }} flexWrap="wrap" alignItems="center">
          {integrationSelector}
        </Stack>
      )}

      {!filtersDisabled && (
        <Stack direction="row" gap={1.5} sx={{ mb: 1 }} flexWrap="wrap" alignItems="center">
          {integrationSelector}
          {availableEnvironments.length > 0 && (
            <Select
              multiple
              value={effectiveEnvFilter}
              onChange={(e) => setEnvFilter(e.target.value as string[])}
              displayEmpty
              renderValue={(selected) => {
                const sel = selected as string[];
                if (sel.length === 0) return 'All Environments';
                return availableEnvironments
                  .filter((env) => sel.includes(env.id))
                  .map((env) => env.name)
                  .join(', ');
              }}
              size="small"
              sx={{ minWidth: 160 }}
              inputProps={{ 'aria-label': 'Environment' }}
              disabled={filtersDisabled}>
              {availableEnvironments.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  <Checkbox checked={effectiveEnvFilter.includes(e.id)} size="small" sx={{ p: 0, mr: 1 }} />
                  <ListItemText primary={e.name} />
                </MenuItem>
              ))}
            </Select>
          )}

          <Select
            multiple
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as string[])}
            displayEmpty
            renderValue={(selected) => {
              const sel = selected as string[];
              if (sel.length === 0) return 'All Levels';
              return sel.join(', ');
            }}
            size="small"
            sx={{ minWidth: 120 }}
            inputProps={{ 'aria-label': 'Log level' }}
            disabled={filtersDisabled}>
            {LOG_LEVELS.map((l) => (
              <MenuItem key={l} value={l}>
                <Checkbox checked={levelFilter.includes(l)} size="small" sx={{ p: 0, mr: 1 }} />
                <ListItemText primary={l} />
              </MenuItem>
            ))}
          </Select>

          <Stack direction="row" alignItems="center" gap={0.5}>
            <Select
              value={timePreset}
              onChange={(e) => {
                const v = e.target.value as string;
                setTimePreset(v);
                if (v === 'custom') {
                  setCustomEnd(toLocalInput(new Date()));
                  setCustomStart(toLocalInput(new Date(Date.now() - 24 * 3600_000)));
                }
              }}
              size="small"
              sx={{ minWidth: 160 }}
              inputProps={{ 'aria-label': 'Time range' }}
              disabled={filtersDisabled}>
              {TIME_PRESETS.map((p) => (
                <MenuItem key={p.label} value={p.label}>
                  {p.label}
                </MenuItem>
              ))}
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
            {timePreset !== '' && (
              <Tooltip title="Clear time filter (defaults to 30 days)">
                <IconButton size="small" onClick={() => setTimePreset('')} disabled={filtersDisabled}>
                  <X size={14} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          <Select value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')} size="small" sx={{ minWidth: 120 }} inputProps={{ 'aria-label': 'Sort direction' }} disabled={filtersDisabled}>
            <MenuItem value="desc">Newest first</MenuItem>
            <MenuItem value="asc">Oldest first</MenuItem>
          </Select>

          <SearchField value={searchPhrase} onChange={setSearchPhrase} placeholder="Search logs..." sx={{ minWidth: 200, flex: 1 }} disabled={filtersDisabled} />

          <FormControlLabel control={<Checkbox checked={autoFetch} onChange={(_, c) => setAutoFetch(c)} size="small" disabled={filtersDisabled} />} label="Auto Fetch" sx={{ mr: 0, whiteSpace: 'nowrap' }} slotProps={{ typography: { variant: 'body2' } }} />
          <Tooltip title="Download logs">
            <IconButton size="small" aria-label="Download logs" onClick={() => downloadLogs(filteredLogs)} disabled={filtersDisabled || filteredLogs.length === 0}>
              <Download size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" aria-label="Refresh" onClick={() => refetch()} disabled={filtersDisabled || !logsRequest}>
                <RefreshCw size={16} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )}

      {!filtersDisabled && timePreset === 'custom' && (
        <Stack direction="row" gap={1.5} sx={{ mb: 2 }} alignItems="center">
          <TextField type="datetime-local" size="small" label="Start" value={customStart} onChange={(e) => setCustomStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} disabled={filtersDisabled} />
          <TextField type="datetime-local" size="small" label="End" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} disabled={filtersDisabled} />
          <Button variant="contained" size="small" onClick={() => refetch()} disabled={filtersDisabled}>
            Apply
          </Button>
        </Stack>
      )}

      {filteredLogs.length > 0 && !isLoading && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, textAlign: 'right' }}>
          {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'} loaded{hasNextPage ? ' — scroll or click "Load more" for additional results' : ''}
        </Typography>
      )}

      {isLoading ? (
        <CircularProgress size={28} sx={{ display: 'block', mx: 'auto', my: 6 }} />
      ) : error ? (
        isUnavailable(error) ? (
          <Stack gap={2} sx={{ width: '100%' }}>
            <MoesifLogsSection
              componentId={moesifTargetComponentId || undefined}
              environmentId={selectedEnvId || undefined}
              projectId={projectId}
              isMI={hasMIRuntimes}
              allIntegrations={allIntegrationsSelected}
              showBothTechnologies={allIntegrationsSelected && projectTechnologies.length > 1}
              perRuntimeLogsHint={
                hasMIRuntimes && runtimeLinkComponent?.handler ? (
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    You can still download{' '}
                    <Link
                      to={hasComponent(scope) ? resourceUrl(scope, 'runtimes') : resourceUrl({ level: 'components', org: scope.org, project: scope.project, component: runtimeLinkComponent.handler }, 'runtimes')}
                      style={{ textDecoration: 'underline', cursor: 'pointer' }}>
                      per-runtime logs
                    </Link>
                    .
                  </Typography>
                ) : undefined
              }
            />
          </Stack>
        ) : (
          <Stack alignItems="center" gap={2} sx={{ py: 6 }}>
            <Typography color="error" textAlign="center">
              Failed to fetch logs: {(error as Error).message ?? 'Service unavailable'}
            </Typography>
            <Button variant="contained" startIcon={<RefreshCw size={16} />} onClick={() => refetch()}>
              Retry
            </Button>
          </Stack>
        )
      ) : filteredLogs.length === 0 ? (
        <EmptyListing icon={<ScrollText size={48} />} title="No logs found" description="Try a different time range or filters." />
      ) : (
        <Stack ref={scrollContainerRef} sx={{ bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
          {filteredLogs.map((log, i) => (
            <LogEntry key={i} log={log} expanded={expanded.has(i)} onToggle={() => toggle(i)} />
          ))}
          <div ref={sentinelRef} />
          {isFetchingNextPage && <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', my: 1 }} />}
          {hasNextPage && !isFetchingNextPage && (
            <Button variant="text" size="small" onClick={() => fetchNextPage()} sx={{ display: 'block', mx: 'auto', my: 1 }}>
              Load more
            </Button>
          )}
          {!hasNextPage && filteredLogs.length > 0 && (
            <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 1 }}>
              Showing {filteredLogs.length} log {filteredLogs.length === 1 ? 'entry' : 'entries'}
            </Typography>
          )}
        </Stack>
      )}
    </PageContent>
  );
}
