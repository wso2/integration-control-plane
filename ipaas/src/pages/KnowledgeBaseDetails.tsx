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

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Menu,
  MenuItem,
  OutlinedInput,
  PageContent,
  PageTitle,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
  TextField,
} from '@wso2/oxygen-ui';
import { ArrowLeft, Clock, Database, ExternalLink, MoreVertical, Play, Plus, RefreshCw, Search, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import { useKnowledgeBase, useUpdateKnowledgeBase } from '../hooks/useKnowledgeBases';
import { useDeleteComponent } from '../hooks/useComponents';
import { useProjectByHandler } from '../hooks/useProjects';
import { getDevPortalBaseUrl } from '../config/runtimeConfig';
import { formatDistanceToNow } from '../utils/time';
import { useTriggerComponent } from '../hooks/useExecutions';
import { knowledgeBasesUrl, newKnowledgeBaseDataSourceUrl, type OrgScope } from '../nav';
import { componentOverviewUrl } from '../paths';
import { describeCron } from '../utils/cronUtils';
import {
  buildKnowledgeBaseSettings,
  chunkingFromConfig,
  dataSourceLabel,
  embeddingFromConfig,
  isEditedSettingsValid,
  isManualSchedule,
  knowledgeBaseSummary,
  knowledgeBaseWriteBlockedReason,
  secretsForUpdate,
  vectorStoreFromConfig,
} from '../utils/knowledgeBase';
import { isChunkingValid, vectorStoreEnvVars } from '../utils/ragIngestion';
import type { KnowledgeBase, KnowledgeBaseDataSource } from '../types/knowledgeBase';
import type { ChunkingConfig, EmbeddingConfig, VectorStoreConfig } from '../types/ragIngestion';
import { isNotFoundError } from '../utils/apiErrors';
import PageNotFound from './PageNotFound';
import PillTabs from '../components/PillTabs';
import EmptyListing from '../components/EmptyListing';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import CopyButton from '../components/Overview/integration-as-api/CopyButton';
import DeploymentStatusChip from '../components/KnowledgeBase/DeploymentStatusChip';
import DeleteKnowledgeBaseDialog from '../components/KnowledgeBase/DeleteKnowledgeBaseDialog';
import KnowledgeBaseRetrieval from '../components/KnowledgeBase/KnowledgeBaseRetrieval';
import ScheduleDialog from '../components/Overview/_shared/ScheduleDialog';
import DataSourceExecutionsDrawer from '../components/KnowledgeBase/DataSourceExecutionsDrawer';
import LastSuccessfulSync from '../components/KnowledgeBase/LastSuccessfulSync';
import VectorStoreStep from '../components/KnowledgeBase/steps/VectorStoreStep';
import EmbeddingModelStep from '../components/KnowledgeBase/steps/EmbeddingModelStep';
import ChunkingStep from '../components/KnowledgeBase/steps/ChunkingStep';
import { dataSourceToolbarSx, overviewGridSx, overviewItemSx, searchFieldSx, sectionHeaderSx, tabsSx, wizardActionsSx } from './KnowledgeBase.styles';

const TABS = [{ label: 'Overview' }, { label: 'Configurations' }, { label: 'Connect to KB' }, { label: 'Retrieval' }];
const CONNECT_TAB = 2;
const ROWS_PER_PAGE = 10;

type Notice = { severity: 'success' | 'warning' | 'error'; text: string };

export default function KnowledgeBaseDetails(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(knowledgeBasesUrl(scope))} sx={{ mb: 2 }}>
        Back to Knowledge Bases
      </Button>
      <KnowledgeBaseLoader scope={scope} />
    </PageContent>
  );
}

function KnowledgeBaseLoader({ scope }: { scope: OrgScope }): JSX.Element {
  const { knowledgeBase: name = '' } = useParams();
  const { data: kb, isLoading, isError, error, refetch } = useKnowledgeBase(name);
  if (isLoading) {
    return (
      <Stack gap={2}>
        <Skeleton variant="text" width={320} height={48} />
        <Skeleton variant="rounded" height={40} width={480} />
        <Skeleton variant="rounded" height={220} />
        <Skeleton variant="rounded" height={180} />
      </Stack>
    );
  }
  if (isNotFoundError(error)) return <PageNotFound title="Knowledge base not found" actionTo={knowledgeBasesUrl(scope)} actionLabel="Back to Knowledge Bases" />;
  if (isError || !kb) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Could not load the knowledge base.
      </Alert>
    );
  }
  return <KnowledgeBaseView scope={scope} kb={kb} />;
}

function KnowledgeBaseView({ scope, kb }: { scope: OrgScope; kb: KnowledgeBase }): JSX.Element {
  const navigate = useAppNavigate();
  const [tab, setTab] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  // Above the configuration tab, which remounts when a save changes the stored settings.
  const [configSaved, setConfigSaved] = useState(false);
  return (
    <>
      <PageTitle>
        <PageTitle.Header>
          <Stack direction="row" gap={1.5} alignItems="center">
            {kb.displayName}
            <DeploymentStatusChip status={kb.status} error={kb.error} />
          </Stack>
        </PageTitle.Header>
        {kb.description && <PageTitle.SubHeader>{kb.description}</PageTitle.SubHeader>}
        {canManage && (
          <PageTitle.Actions>
            <Stack direction="row" gap={1}>
              <Tooltip title={knowledgeBaseWriteBlockedReason(kb, 'delete') ?? ''}>
                <span>
                  <Button variant="outlined" color="error" startIcon={<Trash2 size={16} />} disabled={!!knowledgeBaseWriteBlockedReason(kb, 'delete')} onClick={() => setDeleting(true)}>
                    Delete
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={knowledgeBaseWriteBlockedReason(kb, 'add-data-source') ?? ''}>
                <span>
                  <Button variant="contained" startIcon={<Plus size={16} />} disabled={!!knowledgeBaseWriteBlockedReason(kb, 'add-data-source')} onClick={() => navigate(newKnowledgeBaseDataSourceUrl(scope, kb.name))}>
                    Add Data Source
                  </Button>
                </span>
              </Tooltip>
            </Stack>
          </PageTitle.Actions>
        )}
      </PageTitle>

      <Box sx={tabsSx}>
        <PillTabs value={tab} onChange={setTab} tabs={TABS} />
      </Box>

      {tab === 0 && <OverviewTab scope={scope} kb={kb} onConnect={() => setTab(CONNECT_TAB)} />}
      {/* Keyed on the stored settings, so a save or a refetch restarts the form from them. */}
      {tab === 1 && <ConfigurationTab key={JSON.stringify(kb.config) + kb.secretKeys.join()} kb={kb} saved={configSaved} onSavedChange={setConfigSaved} />}
      {tab === CONNECT_TAB && <ConnectTab scope={scope} kb={kb} onDelete={() => setDeleting(true)} />}
      {tab === 3 && <KnowledgeBaseRetrieval knowledgeBase={kb} componentId={kb.name} />}

      {deleting && <DeleteKnowledgeBaseDialog knowledgeBase={kb} onClose={() => setDeleting(false)} onDeleted={() => navigate(knowledgeBasesUrl(scope))} />}
    </>
  );
}

function OverviewTab({ scope, kb, onConnect }: { scope: OrgScope; kb: KnowledgeBase; onConnect: () => void }): JSX.Element {
  const summary = knowledgeBaseSummary(kb.config);
  return (
    <Stack gap={4}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={sectionHeaderSx}>
            Configuration overview
          </Typography>
          <Box sx={overviewGridSx}>
            <OverviewItem label="Vector store" value={summary.vectorStore} />
            <OverviewItem label="Collection / table" value={summary.collection} />
            <OverviewItem label="Embedding provider" value={summary.embedding} />
            <OverviewItem label="Chunking" value={summary.chunking} />
          </Box>
          <Box sx={{ ...overviewItemSx, mt: 3 }}>
            <Typography variant="caption" color="text.secondary">
              KB service URL
            </Typography>
            {kb.serviceUrl ? (
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {kb.serviceUrl}
                </Typography>
                <CopyButton value={kb.serviceUrl} label="Copy URL" />
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Available once the service is deployed.
              </Typography>
            )}
            <Link component="button" variant="body2" underline="hover" onClick={onConnect}>
              Connect to this Knowledge Base
            </Link>
          </Box>
        </CardContent>
      </Card>

      <DataSources scope={scope} kb={kb} />
    </Stack>
  );
}

function OverviewItem({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Box sx={overviewItemSx}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 500, wordBreak: 'break-word' }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

function DataSources({ scope, kb }: { scope: OrgScope; kb: KnowledgeBase }): JSX.Element {
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const { refetch, isFetching } = useKnowledgeBase(kb.name);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [scheduling, setScheduling] = useState<KnowledgeBaseDataSource | null>(null);
  const [viewingLogs, setViewingLogs] = useState<KnowledgeBaseDataSource | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeBaseDataSource | null>(null);
  const addDataSource = () => navigate(newKnowledgeBaseDataSourceUrl(scope, kb.name));
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const addBlocked = knowledgeBaseWriteBlockedReason(kb, 'add-data-source');

  const refresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['taskExecutions'] });
  };

  const term = search.trim().toLowerCase();
  const filtered = kb.dataSources.filter((ds) => !term || ds.displayName.toLowerCase().includes(term) || ds.name.toLowerCase().includes(term));
  const pageCount = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);

  return (
    <Box>
      <Typography variant="h6">KB Data Sources</Typography>
      <Typography variant="body2" color="text.secondary" sx={sectionHeaderSx}>
        Data sources that ingest data and keep this Knowledge Base updated.
      </Typography>

      {notice && (
        <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice.text}
        </Alert>
      )}

      {kb.dataSources.length === 0 ? (
        <EmptyListing
          icon={<Database size={40} />}
          title="No data sources"
          description={addBlocked ?? 'Add a Google Drive folder or an Amazon S3 bucket to load documents into this knowledge base.'}
          showAction={canManage && !addBlocked}
          actionLabel="Add Data Source"
          onAction={addDataSource}
        />
      ) : (
        <>
          <Stack direction="row" alignItems="center" gap={1} sx={dataSourceToolbarSx}>
            <OutlinedInput
              size="small"
              sx={searchFieldSx}
              placeholder="Search KB Data Sources"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              startAdornment={
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              }
            />
            <Tooltip title="Refresh KB Data Sources">
              <span>
                <IconButton aria-label="Refresh KB Data Sources" onClick={refresh} disabled={isFetching}>
                  {isFetching ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          {filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No data sources match “{search.trim()}”.
            </Typography>
          ) : (
            <Card variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Name', 'Data Source', 'Last Successful Sync', 'Schedule', 'Status'].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 600 }}>
                        {h}
                      </TableCell>
                    ))}
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((ds) => (
                    <DataSourceRow key={ds.name} scope={scope} kb={kb} dataSource={ds} onNotify={setNotice} onSchedule={() => setScheduling(ds)} onViewLogs={() => setViewingLogs(ds)} onDelete={() => setDeleting(ds)} />
                  ))}
                </TableBody>
              </Table>
              {filtered.length > ROWS_PER_PAGE && (
                <TablePagination sx={{ borderTop: '1px solid', borderColor: 'divider' }} component="div" count={filtered.length} page={safePage} onPageChange={(_, p) => setPage(p)} rowsPerPage={ROWS_PER_PAGE} rowsPerPageOptions={[ROWS_PER_PAGE]} />
              )}
            </Card>
          )}
        </>
      )}

      {/* The automations Schedule drawer, saved without a build: a data source has none. */}
      {scheduling && (
        <ScheduleDialog
          open
          onClose={() => setScheduling(null)}
          onSaveSuccess={() => {
            setNotice({ severity: 'success', text: `Schedule updated for ${scheduling.displayName}.` });
            refetch();
          }}
          onSaveError={(text) => setNotice({ severity: 'error', text })}
          envId={kb.environment}
          envName={kb.environment}
          componentId={scheduling.name}
          releaseId={scheduling.releaseName}
          versionId=""
          deploymentPipelineId=""
          allowWithoutBuild
          kind="ingestion"
        />
      )}
      {viewingLogs && <DataSourceExecutionsDrawer kb={kb} dataSource={viewingLogs} orgHandler={scope.org} onClose={() => setViewingLogs(null)} />}
      {deleting && <DeleteDataSourceDialog kb={kb} dataSource={deleting} orgHandler={scope.org} onClose={() => setDeleting(null)} />}
    </Box>
  );
}

interface DataSourceRowProps {
  scope: OrgScope;
  kb: KnowledgeBase;
  dataSource: KnowledgeBaseDataSource;
  onNotify: (notice: Notice) => void;
  onSchedule: () => void;
  onViewLogs: () => void;
  onDelete: () => void;
}

function DataSourceRow({ scope, kb, dataSource: ds, onNotify, onSchedule, onViewLogs, onDelete }: DataSourceRowProps): JSX.Element {
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const trigger = useTriggerComponent();
  const can = useCan();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // A run needs a deployed release to start from.
  const deployed = !!ds.releaseName;

  const ingest = () =>
    trigger.mutate(
      { orgHandler: scope.org, projectId: kb.projectName, componentId: ds.name, releaseId: ds.releaseName },
      {
        onSuccess: () => {
          onNotify({ severity: 'success', text: `Ingestion started for ${ds.displayName}.` });
          // The history route groups by component, not release, so refresh every entry for it.
          queryClient.invalidateQueries({ queryKey: ['taskExecutions'] });
        },
        onError: (e) => onNotify({ severity: 'error', text: e instanceof Error ? e.message : `Could not start ingestion for ${ds.displayName}.` }),
      },
    );

  return (
    <TableRow hover>
      <TableCell>
        <Typography variant="body2">{ds.displayName}</Typography>
        <Typography variant="caption" color="text.secondary">
          {ds.name}
        </Typography>
      </TableCell>
      <TableCell>{dataSourceLabel(ds.config) || '—'}</TableCell>
      <TableCell>{deployed ? <LastSuccessfulSync kb={kb} dataSource={ds} /> : '—'}</TableCell>
      <TableCell>{isManualSchedule(ds.cronExpression) ? 'Manual' : describeCron(ds.cronExpression)}</TableCell>
      <TableCell>
        <DeploymentStatusChip status={ds.status} error={ds.error} />
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" gap={1} justifyContent="flex-end" alignItems="center" sx={{ whiteSpace: 'nowrap' }}>
          {can(Scopes.INTEGRATION_EXECUTE) && (
            <Button size="small" variant="contained" startIcon={trigger.isPending ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />} disabled={!deployed || trigger.isPending} onClick={ingest}>
              Ingest
            </Button>
          )}
          {can(Scopes.INTEGRATION_UPDATE) && (
            <Button size="small" variant="contained" startIcon={<Clock size={14} />} disabled={!deployed} onClick={onSchedule}>
              Schedule
            </Button>
          )}
          <Button size="small" variant="text" disabled={!deployed} onClick={onViewLogs}>
            Execution logs
          </Button>
          <IconButton size="small" aria-label={`Actions for ${ds.displayName}`} onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVertical size={16} />
          </IconButton>
        </Stack>
        <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          <MenuItem
            dense
            onClick={() => {
              setMenuAnchor(null);
              navigate(componentOverviewUrl(scope.org, kb.projectName, ds.name));
            }}>
            View
          </MenuItem>
          {can(Scopes.INTEGRATION_DELETE) && (
            <MenuItem
              dense
              sx={{ color: 'error.main' }}
              onClick={() => {
                setMenuAnchor(null);
                onDelete();
              }}>
              Delete
            </MenuItem>
          )}
        </Menu>
      </TableCell>
    </TableRow>
  );
}

const API_KEY_STEPS = ['Open the Developer Portal and sign in.', 'Create or select an application.', 'Subscribe the application to this KB service.', 'Generate and copy an API key from the application.'];

/** How an application reaches the knowledge base: the KB Service's URL, an API key for it, and the service itself. */
function ConnectTab({ scope, kb, onDelete }: { scope: OrgScope; kb: KnowledgeBase; onDelete: () => void }): JSX.Element {
  const devPortalUrl = getDevPortalBaseUrl();
  return (
    <Stack gap={3}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={sectionHeaderSx}>
            Service details
          </Typography>
          <Stack direction="row" alignItems="center" gap={2}>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              Service URL
            </Typography>
            {kb.serviceUrl ? (
              <>
                <Typography variant="body2" sx={{ flex: 1, wordBreak: 'break-all' }}>
                  {kb.serviceUrl}
                </Typography>
                <CopyButton value={kb.serviceUrl} label="Copy service URL" />
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Not available
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6">Get an API key</Typography>
          <Typography variant="body2" color="text.secondary" sx={sectionHeaderSx}>
            Generate a key in the Developer Portal to call this KB service from your application.
          </Typography>
          <Tooltip title={devPortalUrl ? '' : 'The Developer Portal is not configured for this environment.'}>
            <span>
              <Button variant="outlined" size="small" endIcon={<ExternalLink size={14} />} href={devPortalUrl ?? undefined} target="_blank" rel="noopener noreferrer" disabled={!devPortalUrl}>
                Open Developer Portal
              </Button>
            </span>
          </Tooltip>
          <Box component="ol" sx={{ mt: 2, mb: 0, pl: 2.5 }}>
            {API_KEY_STEPS.map((step) => (
              <Typography key={step} component="li" variant="body2" color="text.secondary">
                {step}
              </Typography>
            ))}
          </Box>
        </CardContent>
      </Card>

      <KnowledgeBaseServiceTable scope={scope} kb={kb} onDelete={onDelete} />
    </Stack>
  );
}

function KnowledgeBaseServiceTable({ scope, kb, onDelete }: { scope: OrgScope; kb: KnowledgeBase; onDelete: () => void }): JSX.Element {
  const navigate = useAppNavigate();
  const { data: project } = useProjectByHandler(kb.projectName);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const lastDeployed = kb.status && kb.updatedAt ? formatDistanceToNow(kb.updatedAt) : '';
  return (
    <Card variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Name', 'Project', 'API Status', 'Last Deployed', 'Status'].map((h) => (
              <TableCell key={h} sx={{ fontWeight: 600 }}>
                {h}
              </TableCell>
            ))}
            <TableCell align="right" sx={{ fontWeight: 600 }}>
              Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow hover>
            <TableCell>
              <Typography variant="body2">{kb.displayName} Service</Typography>
              <Typography variant="caption" color="text.secondary">
                {kb.name}
              </Typography>
            </TableCell>
            <TableCell>{project?.name ?? kb.projectName}</TableCell>
            <TableCell>
              {/* The BFF has no route to read an endpoint's API Platform exposure. */}
              <Tooltip title="API publishing status is not available yet.">
                <span>—</span>
              </Tooltip>
            </TableCell>
            <TableCell>{lastDeployed || '—'}</TableCell>
            <TableCell>
              <DeploymentStatusChip status={kb.status} error={kb.error} />
            </TableCell>
            <TableCell align="right">
              <IconButton size="small" aria-label={`Actions for ${kb.displayName} Service`} onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <MoreVertical size={16} />
              </IconButton>
              <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                <MenuItem
                  dense
                  onClick={() => {
                    setMenuAnchor(null);
                    navigate(componentOverviewUrl(scope.org, kb.projectName, kb.name));
                  }}>
                  View
                </MenuItem>
                {canManage && (
                  <MenuItem
                    dense
                    sx={{ color: 'error.main' }}
                    disabled={!!knowledgeBaseWriteBlockedReason(kb, 'delete')}
                    onClick={() => {
                      setMenuAnchor(null);
                      onDelete();
                    }}>
                    Delete
                  </MenuItem>
                )}
              </Menu>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
}

function DeleteDataSourceDialog({ kb, dataSource, orgHandler, onClose }: { kb: KnowledgeBase; dataSource: KnowledgeBaseDataSource; orgHandler: string; onClose: () => void }): JSX.Element {
  const del = useDeleteComponent();
  const { refetch } = useKnowledgeBase(kb.name);
  // The BFF refuses some deletes without failing the request, reporting canDelete: false.
  const [refused, setRefused] = useState('');
  return (
    <ConfirmDeleteDialog
      title={
        <>
          Delete <strong>{dataSource.displayName}</strong>?
        </>
      }
      isPending={del.isPending}
      onClose={onClose}
      onConfirm={() => {
        setRefused('');
        del.mutate(
          { orgHandler, componentId: dataSource.name, projectId: kb.projectName },
          {
            onSuccess: (result) => {
              if (!result.canDelete) {
                setRefused(result.message || 'The data source could not be deleted.');
                return;
              }
              refetch();
              onClose();
            },
          },
        );
      }}>
      <Typography variant="body2">The data source stops ingesting. Documents it already loaded stay in the knowledge base.</Typography>
      {(del.error || refused) && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {del.error?.message || refused}
        </Alert>
      )}
    </ConfirmDeleteDialog>
  );
}

function ConfigurationTab({ kb, saved, onSavedChange: setSaved }: { kb: KnowledgeBase; saved: boolean; onSavedChange: (saved: boolean) => void }): JSX.Element {
  const update = useUpdateKnowledgeBase(kb.name);
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const saveBlocked = knowledgeBaseWriteBlockedReason(kb, 'save');
  const [displayName, setDisplayName] = useState(kb.displayName);
  const [description, setDescription] = useState(kb.description);
  const [vectorStore, setVectorStore] = useState<VectorStoreConfig | null>(() => vectorStoreFromConfig(kb.config));
  const [embedding, setEmbedding] = useState<EmbeddingConfig | null>(() => embeddingFromConfig(kb.config));
  const [chunking, setChunking] = useState<ChunkingConfig>(() => chunkingFromConfig(kb.config));

  // A stored secret only stands in for the same provider's field: an empty key after a
  // provider switch must be filled in, not resolved to the old provider's key.
  const storedVectorStoreSecrets = vectorStore?.provider === kb.config.VECTORDB_PROVIDER ? kb.secretKeys.filter((k) => k !== 'EMBEDDING_MODEL_APIKEY') : [];
  const embeddingKeyStored = embedding?.provider === kb.config.EMBEDDING_MODEL_PROVIDER && kb.secretKeys.includes('EMBEDDING_MODEL_APIKEY');
  const reusableSecrets = [...storedVectorStoreSecrets, ...(embeddingKeyStored ? ['EMBEDDING_MODEL_APIKEY'] : [])];
  const valid = !!displayName.trim() && isEditedSettingsValid(vectorStore, embedding, reusableSecrets) && isChunkingValid(chunking);
  const changesVectors =
    !!vectorStore &&
    !!embedding &&
    (vectorStore.provider !== kb.config.VECTORDB_PROVIDER || embedding.provider !== kb.config.EMBEDDING_MODEL_PROVIDER || embedding.model !== kb.config.EMBEDDING_MODEL || vectorStoreEnvVars(vectorStore).COLLECTION_NAME !== kb.config.COLLECTION_NAME);

  const save = () => {
    if (!vectorStore || !embedding) return;
    const settings = buildKnowledgeBaseSettings(vectorStore, embedding, chunking);
    setSaved(false);
    update.mutate({ displayName: displayName.trim(), description: description.trim(), config: settings.config, secrets: secretsForUpdate(settings, reusableSecrets) }, { onSuccess: () => setSaved(true) });
  };

  return (
    <Stack gap={4} sx={{ maxWidth: 900 }}>
      {saved && (
        <Alert severity="success" onClose={() => setSaved(false)}>
          Saved. The knowledge base service and its data sources restart with the new settings.
        </Alert>
      )}
      {update.error && (
        <Alert severity="error" onClose={update.reset}>
          {update.error.message}
        </Alert>
      )}
      <Alert severity="warning">Saving restarts the knowledge base service and every data source of this knowledge base, so they pick up the new settings.</Alert>
      <Stack gap={2.5} sx={{ maxWidth: 560 }}>
        <TextField labelPlacement="top" label="Display Name" required fullWidth size="small" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <TextField labelPlacement="top" label="Description" fullWidth size="small" multiline minRows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Stack>
      <Box>
        <VectorStoreStep value={vectorStore} onChange={setVectorStore} storedSecretKeys={storedVectorStoreSecrets} />
      </Box>
      <Box>
        <EmbeddingModelStep value={embedding} onChange={setEmbedding} apiKeyStored={embeddingKeyStored} />
      </Box>
      <Box>
        <ChunkingStep value={chunking} onChange={setChunking} />
      </Box>
      {changesVectors && <Alert severity="warning">Documents already ingested were embedded with the current settings. Run each data source again after saving so retrieval finds them.</Alert>}
      {canManage && saveBlocked && <Alert severity="info">{saveBlocked}</Alert>}
      {canManage && (
        <Stack direction="row" sx={wizardActionsSx}>
          <Button variant="contained" disabled={!valid || update.isPending || !!saveBlocked} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
