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

import { Alert, Button, IconButton, Link, PageContent, PageTitle, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { BookOpen, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { Scopes } from '../constants/permissions';
import { useCan } from '../hooks/useCan';
import { useKnowledgeBases } from '../hooks/useKnowledgeBases';
import { knowledgeBaseUrl, newKnowledgeBaseUrl, type OrgScope } from '../nav';
import { knowledgeBaseSummary } from '../utils/knowledgeBase';
import type { KnowledgeBase } from '../types/knowledgeBase';
import DataTable from '../components/DataTable';
import EmptyListing from '../components/EmptyListing';
import SearchField from '../components/SearchField';
import DeploymentStatusChip from '../components/KnowledgeBase/DeploymentStatusChip';
import DeleteKnowledgeBaseDialog from '../components/KnowledgeBase/DeleteKnowledgeBaseDialog';
import { toolbarSx } from './KnowledgeBase.styles';

const HEADERS = ['Name', 'Vector Store', 'Embedding Model', 'Data Sources', 'Status', ''];

export default function KnowledgeBases(scope: OrgScope): JSX.Element {
  return (
    <PageContent fullWidth>
      <PageTitle>
        <PageTitle.Header>Knowledge Bases</PageTitle.Header>
        <PageTitle.SubHeader>Documents from your data sources, chunked and embedded into a vector store, for AI agents and integrations to retrieve from.</PageTitle.SubHeader>
      </PageTitle>
      <KnowledgeBaseList scope={scope} />
    </PageContent>
  );
}

function KnowledgeBaseList({ scope }: { scope: OrgScope }): JSX.Element {
  const navigate = useAppNavigate();
  const { data: knowledgeBases, isLoading, isError, refetch } = useKnowledgeBases();
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<KnowledgeBase | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? knowledgeBases?.filter((kb) => kb.displayName.toLowerCase().includes(s) || kb.name.includes(s)) : knowledgeBases;
  }, [knowledgeBases, search]);

  if (isLoading) {
    return (
      <Stack gap={1.5}>
        <Skeleton variant="rounded" height={40} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={48} />
        ))}
      </Stack>
    );
  }
  if (isError || !knowledgeBases) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Could not load knowledge bases.
      </Alert>
    );
  }
  if (knowledgeBases.length === 0) {
    return (
      <EmptyListing
        icon={<BookOpen size={48} />}
        title="No knowledge bases"
        description="Create a knowledge base to give your AI agents and integrations retrieval over your documents."
        showAction={canManage}
        actionLabel="Create Knowledge Base"
        onAction={() => navigate(newKnowledgeBaseUrl(scope))}
      />
    );
  }

  const rows = (filtered ?? []).map((kb) => {
    const summary = knowledgeBaseSummary(kb.config);
    return [
      <Link key="name" component={RouterLink} to={knowledgeBaseUrl(scope, kb.name)} underline="hover">
        {kb.displayName}
      </Link>,
      <Typography key="vs" variant="body2">
        {summary.vectorStore}
        {summary.collection && (
          <Typography component="span" variant="body2" color="text.secondary">
            {' · '}
            {summary.collection}
          </Typography>
        )}
      </Typography>,
      summary.embedding,
      String(kb.dataSources.length),
      <DeploymentStatusChip key="status" status={kb.status} error={kb.error} />,
      canManage ? (
        <Tooltip key="delete" title="Delete">
          <IconButton size="small" color="error" aria-label={`Delete ${kb.displayName}`} onClick={() => setDeleting(kb)}>
            <Trash2 size={16} />
          </IconButton>
        </Tooltip>
      ) : (
        ''
      ),
    ];
  });

  return (
    <>
      <Stack direction="row" gap={1} alignItems="center" sx={toolbarSx}>
        <SearchField value={search} onChange={setSearch} placeholder="Search knowledge bases..." fullWidth />
        {canManage && (
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => navigate(newKnowledgeBaseUrl(scope))} sx={{ whiteSpace: 'nowrap', flexShrink: 0, px: 2.5 }}>
            Create Knowledge Base
          </Button>
        )}
      </Stack>
      {deleted && (
        <Alert severity="success" onClose={() => setDeleted(null)} sx={toolbarSx}>
          Knowledge base &apos;{deleted}&apos; deleted.
        </Alert>
      )}
      <DataTable headers={HEADERS} rows={rows} emptyMsg="No knowledge bases match your search." />
      {deleting && (
        <DeleteKnowledgeBaseDialog
          knowledgeBase={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleted(deleting.displayName);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
