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

import { Alert, Box, Button, CircularProgress, PageContent, PageTitle, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useCan } from '../hooks/useCan';
import { Scopes } from '../constants/permissions';
import { useRoles } from '../hooks/useAuth';
import { isContextEngineEnabled, useContextEngine, useDeleteContextEngine, useRouteEngineId } from '../hooks/useContextEngine';
import { useStagedEngineSources } from '../hooks/stagedEngineSources';
import { engineMessage } from '../utils/contextEngine';
import { contextEngineUrl, contextEnginesUrl } from '../paths';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import NotFound from '../components/NotFound';
import DeleteEngineDialog from '../components/ContextEngine/DeleteEngineDialog';
import EngineStateChip from '../components/ContextEngine/EngineStateChip';
import OverviewTab from '../components/ContextEngine/detail/OverviewTab';
import PlaygroundTab from '../components/ContextEngine/detail/PlaygroundTab';
import GraphTab from '../components/ContextEngine/detail/GraphTab';
import ApiTab from '../components/ContextEngine/detail/ApiTab';
import McpTab from '../components/ContextEngine/detail/McpTab';
import ApiMockTab from '../components/ContextEngine/detail/mock/ApiMockTab';
import McpMockTab from '../components/ContextEngine/detail/mock/McpMockTab';
// import AccessTab from '../components/ContextEngine/detail/AccessTab';
import type { ContextEngineSetup, ContextEngineState, ContextEngineTabKey } from '../types/contextEngine';
import { wrapSx } from '../components/ContextEngine/styles';
import type { OrgScope } from '../nav';

const TABS: { value: ContextEngineTabKey; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'playground', label: 'Playground' },
  { value: 'graph', label: 'Graph' },
  { value: 'api', label: 'API' },
  { value: 'mcp', label: 'MCP' },
  // MOCK: proposed layouts for the API and MCP tabs, for the team to compare with the real ones.
  { value: 'api-mock', label: 'API mock' },
  { value: 'mcp-mock', label: 'MCP mock' },
  // { value: 'access', label: 'Access' },
];

const alertSx = { mb: 3 } as const;
const listSx = { m: 0, mt: 1, pl: 2.5 } as const;

interface EngineStatusAlertProps {
  engineId: string;
  state: ContextEngineState;
  reason?: string;
  setup?: ContextEngineSetup;
}

/** Why an engine that is not running shows only its overview, then where adding its sources stands: the BFF's connector sources, and the File Upload sources this tab holds. */
function EngineStatusAlert({ engineId, state, reason, setup }: EngineStatusAlertProps): JSX.Element | null {
  const staged = useStagedEngineSources(engineId);
  const [dismissed, setDismissed] = useState(false);
  if (state === 'failed') {
    return (
      <Alert severity="error" variant="outlined" sx={alertSx}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          This engine failed to start
        </Typography>
        {reason ?? 'Delete it and create it again, or check its models and keys.'}
      </Alert>
    );
  }
  if (state === 'unknown') {
    return (
      <Alert severity="warning" variant="outlined" sx={alertSx}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Status unavailable
        </Typography>
        {reason ?? "This engine's state could not be read. This page checks again shortly."}
      </Alert>
    );
  }
  if (state !== 'ready') {
    return (
      <Alert severity="info" variant="outlined" icon={<CircularProgress size={18} />} sx={alertSx}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          This engine is starting
        </Typography>
        {reason ? `${reason.replace(/\.$/, '')}. ` : ''}Its sources, playground and endpoints open once it is running. This usually takes about a minute.
        {staged.waiting > 0 && ' Keep this tab open until then: your files are uploaded from it.'}
      </Alert>
    );
  }
  if (setup?.status === 'pending' || staged.waiting > 0) {
    return (
      <Alert severity="info" variant="outlined" icon={<CircularProgress size={18} />} sx={alertSx}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Adding your sources
        </Typography>
        {staged.waiting > 0 ? 'The engine is running. Your sources are being added; keep this tab open: your files are uploaded from it.' : 'The engine is running. Your sources are being added; you can leave this page.'}
      </Alert>
    );
  }
  if (dismissed) return null;
  if (setup?.status === 'interrupted') {
    return (
      <Alert severity="warning" variant="outlined" onClose={() => setDismissed(true)} sx={alertSx}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Setup didn&apos;t finish
        </Typography>
        Some sources may be missing. Check the list and add any that aren&apos;t there.
      </Alert>
    );
  }
  const warnings = [...(setup?.status === 'failed' ? setup.warnings : []), ...staged.failures];
  if (warnings.length === 0) return null;
  return (
    <Alert severity="warning" variant="outlined" onClose={() => setDismissed(true)} sx={alertSx}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Some sources weren&apos;t added
      </Typography>
      Add them again from this page.
      <Box component="ul" sx={listSx}>
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </Box>
    </Alert>
  );
}

const centeredSx = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' } as const;
const tabsSx = { borderBottom: '1px solid', borderColor: 'divider', mb: 3 } as const;

function NoConsoleAccess(): JSX.Element {
  return (
    <Alert severity="info" variant="outlined">
      Your role can&apos;t query this engine or browse its graph.
    </Alert>
  );
}

export default function ContextEngineDetail(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { tab = 'overview' } = useParams();
  const engineId = useRouteEngineId();
  const { data: engine, isLoading, isError, error, refetch } = useContextEngine(engineId);
  const { data: orgRoles } = useRoles(scope.org);
  const roleNames = useMemo(() => Object.fromEntries((orgRoles ?? []).map((r) => [r.roleId, r.roleName])), [orgRoles]);
  const remove = useDeleteContextEngine();
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleting = engine?.state === 'deleting';
  // Once an engine seen deleting answers 404, it was deleted rather than never there.
  const seenDeleting = useRef(false);
  if (deleting) seenDeleting.current = true;
  const base = contextEnginesUrl(scope.org);

  if (!isContextEngineEnabled()) {
    return <ComingSoon title="Coming Soon" description="Context Engines are currently under development." />;
  }

  const activeTab: ContextEngineTabKey = TABS.some((t) => t.value === tab) ? (tab as ContextEngineTabKey) : 'overview';
  const goTab = (next: ContextEngineTabKey) => navigate(contextEngineUrl(scope.org, engineId, next));

  const back = (
    <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(base)} sx={{ mb: 2 }}>
      Back to context engines
    </Button>
  );

  if (isLoading) {
    return (
      <PageContent sx={wrapSx}>
        {back}
        <Box sx={centeredSx}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }

  if (!engineId || (isError && error instanceof HttpError && error.status === 404)) {
    return (
      <PageContent sx={wrapSx}>
        {back}
        <NotFound message={seenDeleting.current ? 'This context engine was deleted.' : "This context engine does not exist, or you don't have access to it."} backTo={base} />
      </PageContent>
    );
  }

  if (isError || !engine) {
    return (
      <PageContent sx={wrapSx}>
        {back}
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load this context engine.
        </Alert>
      </PageContent>
    );
  }

  const onDelete = () => {
    setDeleteError(null);
    remove.mutate(engine.id, {
      onSuccess: () => navigate(base, { state: { engineDeleted: true, engineName: engine.name } }),
      onError: (e) => setDeleteError(e instanceof HttpError && e.status === 403 ? "You don't have permission to delete context engines." : `Couldn't delete the context engine: ${engineMessage(e, 'please try again')}.`),
    });
  };
  const running = engine.state === 'ready';
  const shownTab: ContextEngineTabKey = running ? activeTab : 'overview';

  return (
    <PageContent sx={wrapSx}>
      {back}
      {/* The console's page header, as on the Context Engines list and the project pages. */}
      <PageTitle>
        <PageTitle.Header>
          <Stack component="span" direction="row" alignItems="center" gap={1.5}>
            {engine.name}
            <EngineStateChip state={engine.state} reason={engine.statusReason} />
          </Stack>
        </PageTitle.Header>
        {engine.description && <PageTitle.SubHeader>{engine.description}</PageTitle.SubHeader>}
      </PageTitle>

      {deleting && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            This engine is being deleted
          </Typography>
          Questions, uploads and changes are paused, and its API and MCP endpoints have stopped answering. It disappears from your list once it is gone.
        </Alert>
      )}
      {!deleting && <EngineStatusAlert engineId={engine.id} state={engine.state} reason={engine.statusReason} setup={engine.setup} />}

      {deleteError && !confirmDelete && (
        <Alert severity="error" onClose={() => setDeleteError(null)} sx={{ mb: 3 }}>
          {deleteError}
        </Alert>
      )}

      <Tabs value={shownTab} onChange={(_, v) => goTab(v as ContextEngineTabKey)} sx={tabsSx}>
        {TABS.map((t) => (
          <Tab key={t.value} label={t.label} value={t.value} disabled={!running && t.value !== 'overview'} />
        ))}
      </Tabs>

      {shownTab === 'overview' && <OverviewTab engine={engine} orgHandle={scope.org} roleNames={roleNames} onGoTab={goTab} readOnly={!running} onRequestDelete={deleting || !canManage ? undefined : () => setConfirmDelete(true)} />}
      {shownTab === 'playground' && (canManage ? <PlaygroundTab engine={engine} orgHandle={scope.org} /> : <NoConsoleAccess />)}
      {shownTab === 'graph' && (canManage ? <GraphTab engine={engine} orgHandle={scope.org} /> : <NoConsoleAccess />)}
      {shownTab === 'api' && <ApiTab engine={engine} />}
      {shownTab === 'mcp' && <McpTab key={engine.id} engine={engine} />}
      {shownTab === 'api-mock' && <ApiMockTab engine={engine} orgHandle={scope.org} />}
      {shownTab === 'mcp-mock' && <McpMockTab engine={engine} />}
      {/* {shownTab === 'access' && <AccessTab engine={engine} orgHandle={scope.org} />} */}

      {confirmDelete && (
        <DeleteEngineDialog
          name={engine.name}
          sourceCount={engine.sources.length}
          isPending={remove.isPending}
          error={deleteError}
          onConfirm={onDelete}
          onClose={() => {
            if (remove.isPending) return;
            setConfirmDelete(false);
            setDeleteError(null);
          }}
        />
      )}
    </PageContent>
  );
}
