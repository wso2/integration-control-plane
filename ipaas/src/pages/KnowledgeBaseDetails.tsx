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

import { Alert, Box, Button, Card, CardContent, CircularProgress, IconButton, Link, PageContent, PageTitle, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Database, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useKnowledgeBase, useUpdateKnowledgeBase } from '../hooks/useKnowledgeBases';
import { useDeleteComponent } from '../hooks/useComponents';
import { knowledgeBasesUrl, newKnowledgeBaseDataSourceUrl, type OrgScope } from '../nav';
import { componentOverviewUrl } from '../paths';
import { describeCron } from '../utils/cronUtils';
import { buildKnowledgeBaseSettings, chunkingFromConfig, dataSourceLabel, embeddingFromConfig, isEditedSettingsValid, knowledgeBaseSummary, secretsForUpdate, vectorStoreFromConfig } from '../utils/knowledgeBase';
import { isChunkingValid } from '../utils/ragIngestion';
import type { KnowledgeBase, KnowledgeBaseDataSource } from '../types/knowledgeBase';
import type { ChunkingConfig, EmbeddingConfig, VectorStoreConfig } from '../types/ragIngestion';
import { isNotFoundError } from '../utils/apiErrors';
import PageNotFound from './PageNotFound';
import PillTabs from '../components/PillTabs';
import DataTable from '../components/DataTable';
import EmptyListing from '../components/EmptyListing';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import TextField from '../components/common/TextField';
import CopyButton from '../components/Overview/integration-as-api/CopyButton';
import DeploymentStatusChip from '../components/KnowledgeBase/DeploymentStatusChip';
import DeleteKnowledgeBaseDialog from '../components/KnowledgeBase/DeleteKnowledgeBaseDialog';
import KnowledgeBaseRetrieval from '../components/KnowledgeBase/KnowledgeBaseRetrieval';
import VectorStoreStep from '../components/KnowledgeBase/steps/VectorStoreStep';
import EmbeddingModelStep from '../components/KnowledgeBase/steps/EmbeddingModelStep';
import ChunkingStep from '../components/KnowledgeBase/steps/ChunkingStep';
import { sectionHeaderSx, summaryGridSx, tabsSx, wizardActionsSx } from './KnowledgeBase.styles';

const TABS = [{ label: 'Overview' }, { label: 'Configuration' }, { label: 'Retrieval' }];

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
  return (
    <>
      <PageTitle>
        <PageTitle.Header>
          <Stack direction="row" gap={1.5} alignItems="center">
            {kb.displayName}
            <DeploymentStatusChip status={kb.status} />
          </Stack>
        </PageTitle.Header>
        {kb.description && <PageTitle.SubHeader>{kb.description}</PageTitle.SubHeader>}
        <PageTitle.Actions>
          <Button variant="outlined" color="error" startIcon={<Trash2 size={16} />} onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </PageTitle.Actions>
      </PageTitle>

      <Box sx={tabsSx}>
        <PillTabs value={tab} onChange={setTab} tabs={TABS} />
      </Box>

      {tab === 0 && <OverviewTab scope={scope} kb={kb} />}
      {/* Keyed on the stored settings, so a save or a refetch restarts the form from them. */}
      {tab === 1 && <ConfigurationTab key={JSON.stringify(kb.config) + kb.secretKeys.join()} kb={kb} />}
      {tab === 2 && <KnowledgeBaseRetrieval knowledgeBase={kb} componentId={kb.name} />}

      {deleting && <DeleteKnowledgeBaseDialog knowledgeBase={kb} onClose={() => setDeleting(false)} onDeleted={() => navigate(knowledgeBasesUrl(scope))} />}
    </>
  );
}

function OverviewTab({ scope, kb }: { scope: OrgScope; kb: KnowledgeBase }): JSX.Element {
  const navigate = useAppNavigate();
  const summary = knowledgeBaseSummary(kb.config);
  const [deleting, setDeleting] = useState<KnowledgeBaseDataSource | null>(null);
  const addDataSource = () => navigate(newKnowledgeBaseDataSourceUrl(scope, kb.name));

  const rows = kb.dataSources.map((ds) => [
    <Link key="name" component={RouterLink} to={componentOverviewUrl(scope.org, kb.projectName, ds.name)} underline="hover">
      {ds.displayName}
    </Link>,
    dataSourceLabel(ds.config),
    ds.cronExpression ? describeCron(ds.cronExpression) : 'Runs on demand',
    <DeploymentStatusChip key="status" status={ds.status} />,
    <Tooltip key="delete" title="Delete">
      <IconButton size="small" color="error" aria-label={`Delete ${ds.displayName}`} onClick={() => setDeleting(ds)}>
        <Trash2 size={16} />
      </IconButton>
    </Tooltip>,
  ]);

  return (
    <Stack gap={3}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, ...sectionHeaderSx }}>
            Settings
          </Typography>
          <Box sx={summaryGridSx}>
            <SummaryRow label="Vector Store" value={summary.vectorStore} />
            <SummaryRow label="Collection" value={summary.collection} />
            <SummaryRow label="Embedding Model" value={summary.embedding} />
            <SummaryRow label="Chunking" value={summary.chunking} />
            <SummaryRow label="Environment" value={kb.environment} />
            <Typography variant="body2" color="text.secondary">
              Service URL
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
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={sectionHeaderSx}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Data Sources
            </Typography>
            {kb.dataSources.length > 0 && (
              <Button size="small" variant="outlined" startIcon={<Plus size={16} />} onClick={addDataSource}>
                Add Data Source
              </Button>
            )}
          </Stack>
          {kb.dataSources.length === 0 ? (
            <EmptyListing icon={<Database size={40} />} title="No data sources" description="Add a Google Drive folder or an Amazon S3 bucket to load documents into this knowledge base." showAction actionLabel="Add Data Source" onAction={addDataSource} />
          ) : (
            <DataTable headers={['Name', 'Source', 'Schedule', 'Status', '']} rows={rows} />
          )}
        </CardContent>
      </Card>

      {deleting && <DeleteDataSourceDialog kb={kb} dataSource={deleting} orgHandler={scope.org} onClose={() => setDeleting(null)} />}
    </Stack>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value || '—'}</Typography>
    </>
  );
}

function DeleteDataSourceDialog({ kb, dataSource, orgHandler, onClose }: { kb: KnowledgeBase; dataSource: KnowledgeBaseDataSource; orgHandler: string; onClose: () => void }): JSX.Element {
  const del = useDeleteComponent();
  const { refetch } = useKnowledgeBase(kb.name);
  return (
    <ConfirmDeleteDialog
      title={
        <>
          Delete <strong>{dataSource.displayName}</strong>?
        </>
      }
      isPending={del.isPending}
      onClose={onClose}
      onConfirm={() =>
        del.mutate(
          { orgHandler, componentId: dataSource.name, projectId: kb.projectName },
          {
            onSuccess: () => {
              refetch();
              onClose();
            },
          },
        )
      }>
      <Typography variant="body2">The data source stops ingesting. Documents it already loaded stay in the knowledge base.</Typography>
      {del.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {del.error.message}
        </Alert>
      )}
    </ConfirmDeleteDialog>
  );
}

function ConfigurationTab({ kb }: { kb: KnowledgeBase }): JSX.Element {
  const update = useUpdateKnowledgeBase(kb.name);
  const [displayName, setDisplayName] = useState(kb.displayName);
  const [description, setDescription] = useState(kb.description);
  const [vectorStore, setVectorStore] = useState<VectorStoreConfig | null>(() => vectorStoreFromConfig(kb.config));
  const [embedding, setEmbedding] = useState<EmbeddingConfig | null>(() => embeddingFromConfig(kb.config));
  const [chunking, setChunking] = useState<ChunkingConfig>(() => chunkingFromConfig(kb.config));
  const [saved, setSaved] = useState(false);

  // A stored secret only stands in for the same provider's field.
  const storedVectorStoreSecrets = vectorStore?.provider === kb.config.VECTORDB_PROVIDER ? kb.secretKeys : [];
  const embeddingKeyStored = embedding?.provider === kb.config.EMBEDDING_MODEL_PROVIDER && kb.secretKeys.includes('EMBEDDING_MODEL_APIKEY');
  const valid = !!displayName.trim() && isEditedSettingsValid(vectorStore, embedding, [...storedVectorStoreSecrets, ...(embeddingKeyStored ? ['EMBEDDING_MODEL_APIKEY'] : [])]) && isChunkingValid(chunking);
  const changesVectors = !!vectorStore && !!embedding && (vectorStore.provider !== kb.config.VECTORDB_PROVIDER || embedding.provider !== kb.config.EMBEDDING_MODEL_PROVIDER || embedding.model !== kb.config.EMBEDDING_MODEL);

  const save = () => {
    if (!vectorStore || !embedding) return;
    const settings = buildKnowledgeBaseSettings(vectorStore, embedding, chunking);
    setSaved(false);
    update.mutate({ displayName: displayName.trim(), description: description.trim(), config: settings.config, secrets: secretsForUpdate(settings, kb.secretKeys) }, { onSuccess: () => setSaved(true) });
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
        <TextField label="Display Name" required fullWidth size="small" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <TextField label="Description" fullWidth size="small" multiline minRows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
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
      <Stack direction="row" sx={wizardActionsSx}>
        <Button variant="contained" disabled={!valid || update.isPending} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </Stack>
    </Stack>
  );
}
