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

import { Alert, Box, Button, CircularProgress, IconButton, PageContent, Stack, Tab, Tabs, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useLocation, useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useRoles } from '../hooks/useAuth';
import { isContextEngineEnabled, useContextEngine, useDeleteContextEngine, useDeletionJob } from '../hooks/useContextEngine';
import { deletionFailureText, engineMessage } from '../utils/contextEngine';
import { contextEngineUrl, contextEnginesUrl } from '../paths';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import NotFound from '../components/NotFound';
import DeleteEngineDialog from '../components/ContextEngine/DeleteEngineDialog';
import EngineStateChip from '../components/ContextEngine/EngineStateChip';
import { EngineGraphChip } from '../components/ContextEngine/GraphStatusChip';
import OverviewTab from '../components/ContextEngine/detail/OverviewTab';
import PlaygroundTab from '../components/ContextEngine/detail/PlaygroundTab';
import ApiTab from '../components/ContextEngine/detail/ApiTab';
import McpTab from '../components/ContextEngine/detail/McpTab';
// import AccessTab from '../components/ContextEngine/detail/AccessTab';
import type { CreateContextEngineLocationState } from './CreateContextEngine';
import type { ContextEngineTabKey } from '../types/contextEngine';
import type { OrgScope } from '../nav';

const TABS: { value: ContextEngineTabKey; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'playground', label: 'Playground' },
  { value: 'api', label: 'API' },
  { value: 'mcp', label: 'MCP' },
  // { value: 'access', label: 'Access' },
];

const centeredSx = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' } as const;
const tabsSx = { borderBottom: '1px solid', borderColor: 'divider', mb: 3 } as const;

export default function ContextEngineDetail(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { engineId = '', tab = 'overview' } = useParams();
  const { state } = useLocation() as { state: CreateContextEngineLocationState | null };
  const [warnings, setWarnings] = useState<string[]>(state?.warnings ?? []);
  const openFilesSourceId = state?.openFiles;
  const { data: engine, isLoading, isError, error, refetch } = useContextEngine(engineId);
  const { data: orgRoles } = useRoles(scope.org);
  const roleNames = useMemo(() => Object.fromEntries((orgRoles ?? []).map((r) => [r.roleId, r.roleName])), [orgRoles]);
  const remove = useDeleteContextEngine();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleting = engine?.state === 'deleting';
  const deletion = useDeletionJob(engineId, deleting);
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
      <PageContent>
        {back}
        <Box sx={centeredSx}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }

  if (isError && error instanceof HttpError && error.status === 404) {
    return (
      <PageContent>
        {back}
        <NotFound message={seenDeleting.current ? 'This context engine was deleted.' : "This context engine does not exist, or you don't have access to it."} backTo={base} />
      </PageContent>
    );
  }

  if (isError || !engine) {
    return (
      <PageContent>
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

  // Deleting runs as a job on the engine: the page stays, read-only, until the engine is gone.
  const onDelete = () => {
    setDeleteError(null);
    remove.mutate(engine.id, {
      onSuccess: () => setConfirmDelete(false),
      onError: (e) =>
        setDeleteError(
          e instanceof HttpError && e.status === 403
            ? 'Deleting an engine needs the manage permission on it.'
            : e instanceof HttpError && e.status === 405
              ? 'This engine does not support deletion yet.'
              : `Couldn't delete the context engine: ${engineMessage(e, 'please try again')}.`,
        ),
    });
  };
  const deletionFailed = deleting && deletion.data?.state === 'failed';
  const shownTab: ContextEngineTabKey = deleting ? 'overview' : activeTab;

  return (
    <PageContent>
      {back}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <Typography variant="h5" sx={{ fontWeight: 600 }} noWrap>
              {engine.name}
            </Typography>
            <EngineStateChip state={engine.state} />
            <EngineGraphChip engineId={engine.id} reported={engine.graph} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {engine.description || 'No description'}
          </Typography>
        </Box>
        {!deleting && (
          <Tooltip title="Delete engine">
            <IconButton color="error" aria-label={`Delete ${engine.name}`} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={18} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {deleting &&
        (deletionFailed ? (
          <Alert
            severity="error"
            variant="outlined"
            sx={{ mb: 3 }}
            action={
              <Button color="inherit" size="small" disabled={remove.isPending} onClick={onDelete}>
                Retry
              </Button>
            }>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Deleting this engine failed
            </Typography>
            {deletionFailureText(deletion.data?.error?.code)}
          </Alert>
        ) : (
          <Alert severity="warning" variant="outlined" sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              This engine is being deleted
            </Typography>
            Questions, uploads and changes are paused, and its API and MCP endpoints have stopped answering. It disappears from your list once the engine finishes.
          </Alert>
        ))}

      {warnings.length > 0 && (
        <Alert severity="warning" variant="outlined" onClose={() => setWarnings([])} sx={{ mb: 3 }}>
          The engine was created, but not every step completed:
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </Box>
        </Alert>
      )}

      {deleteError && !confirmDelete && (
        <Alert severity="error" variant="outlined" onClose={() => setDeleteError(null)} sx={{ mb: 3 }}>
          {deleteError}
        </Alert>
      )}

      <Tabs value={shownTab} onChange={(_, v) => goTab(v as ContextEngineTabKey)} sx={tabsSx}>
        {TABS.map((t) => (
          <Tab key={t.value} label={t.label} value={t.value} disabled={deleting && t.value !== 'overview'} />
        ))}
      </Tabs>

      {shownTab === 'overview' && <OverviewTab engine={engine} orgHandle={scope.org} roleNames={roleNames} onGoTab={goTab} openFilesSourceId={openFilesSourceId} readOnly={deleting} />}
      {shownTab === 'playground' && <PlaygroundTab engine={engine} orgHandle={scope.org} />}
      {shownTab === 'api' && <ApiTab engine={engine} />}
      {shownTab === 'mcp' && <McpTab engine={engine} />}
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
