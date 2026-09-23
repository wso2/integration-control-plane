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
import { useMemo, useState, type JSX } from 'react';
import { useLocation, useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useRoles } from '../hooks/useAuth';
import { isContextEngineEnabled, useContextEngine, useDeleteContextEngine } from '../hooks/useContextEngine';
import { contextEngineUrl, contextEnginesUrl } from '../paths';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import NotFound from '../components/NotFound';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import EngineStateChip from '../components/ContextEngine/EngineStateChip';
import OverviewTab from '../components/ContextEngine/detail/OverviewTab';
import PlaygroundTab from '../components/ContextEngine/detail/PlaygroundTab';
import ApiTab from '../components/ContextEngine/detail/ApiTab';
import McpTab from '../components/ContextEngine/detail/McpTab';
import AccessTab from '../components/ContextEngine/detail/AccessTab';
import type { CreateContextEngineLocationState } from './CreateContextEngine';
import type { ContextEngineTabKey } from '../types/contextEngine';
import type { OrgScope } from '../nav';

const TABS: { value: ContextEngineTabKey; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'playground', label: 'Playground' },
  { value: 'api', label: 'API' },
  { value: 'mcp', label: 'MCP' },
  { value: 'access', label: 'Access' },
];

const centeredSx = { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' } as const;
const tabsSx = { borderBottom: '1px solid', borderColor: 'divider', mb: 3 } as const;

export default function ContextEngineDetail(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { engineId = '', tab = 'overview' } = useParams();
  const { state } = useLocation() as { state: CreateContextEngineLocationState | null };
  const [warnings, setWarnings] = useState<string[]>(state?.warnings ?? []);
  const { data: engine, isLoading, isError, error, refetch } = useContextEngine(engineId);
  const { data: orgRoles } = useRoles(scope.org);
  const roleNames = useMemo(() => Object.fromEntries((orgRoles ?? []).map((r) => [r.roleId, r.roleName])), [orgRoles]);
  const remove = useDeleteContextEngine();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
        <NotFound message="This context engine does not exist, or you don't have access to it." backTo={base} />
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

  const onDelete = () => {
    setDeleteError(null);
    remove.mutate(engine.id, {
      onSuccess: () => navigate(base),
      onError: (e) => {
        setConfirmDelete(false);
        setDeleteError(e instanceof HttpError && (e.status === 404 || e.status === 405) ? 'This engine does not support deletion yet.' : "Couldn't delete the context engine. Please try again.");
      },
    });
  };

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
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {engine.description || 'No description'}
          </Typography>
        </Box>
        <Tooltip title="Delete engine">
          <IconButton color="error" aria-label={`Delete ${engine.name}`} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={18} />
          </IconButton>
        </Tooltip>
      </Stack>

      {warnings.length > 0 && (
        <Alert severity="info" variant="outlined" onClose={() => setWarnings([])} sx={{ mb: 3 }}>
          The engine was created. The connected engine does not serve these steps yet, so they were skipped:
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </Box>
        </Alert>
      )}

      {deleteError && (
        <Alert severity="error" variant="outlined" onClose={() => setDeleteError(null)} sx={{ mb: 3 }}>
          {deleteError}
        </Alert>
      )}

      <Tabs value={activeTab} onChange={(_, v) => goTab(v as ContextEngineTabKey)} sx={tabsSx}>
        {TABS.map((t) => (
          <Tab key={t.value} label={t.label} value={t.value} />
        ))}
      </Tabs>

      {activeTab === 'overview' && <OverviewTab engine={engine} roleNames={roleNames} onGoTab={goTab} />}
      {activeTab === 'playground' && <PlaygroundTab engine={engine} />}
      {activeTab === 'api' && <ApiTab engine={engine} />}
      {activeTab === 'mcp' && <McpTab engine={engine} />}
      {activeTab === 'access' && <AccessTab engine={engine} orgHandle={scope.org} />}

      {confirmDelete && (
        <ConfirmDeleteDialog
          title={
            <>
              Delete <strong>{engine.name}</strong>?
            </>
          }
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(false)}
          isPending={remove.isPending}>
          <Typography variant="body2" color="text.secondary">
            The context graph, its sources and every grant on this engine will be removed. Integrations and agents calling its API or MCP endpoint will stop receiving answers.
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </PageContent>
  );
}
