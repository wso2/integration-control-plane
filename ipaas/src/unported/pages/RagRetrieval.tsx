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

import { Alert, Box, Button, CircularProgress, Link, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { isRagIngestionEnabled, useRetrieveChunks } from '../../hooks/useRagIngestion';
import { useSubscriptions } from '../../hooks/useSubscription';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { PAID_SUBSCRIPTION_TYPE } from '../../constants/subscription';
import { DEFAULT_RETRIEVAL_QUERY } from '../../constants/ragIngestion';
import { isEmbeddingValid, isRetrievalQueryValid, isVectorStoreValid } from '../../utils/ragIngestion';
import ComingSoon from '../../pages/ComingSoon';
import VerticalStepper from '../../components/VerticalStepper';
import VectorStoreStep from '../components/RagIngestion/steps/VectorStoreStep';
import EmbeddingModelStep from '../components/RagIngestion/steps/EmbeddingModelStep';
import QueryRetrieveStep from '../components/RagIngestion/steps/QueryRetrieveStep';
import RagUpgradeRequired from '../components/RagIngestion/RagUpgradeRequired';
import type { OrgScope } from '../../nav';
import type { EmbeddingConfig, RetrievalQuery, VectorStoreConfig } from '../../types/ragIngestion';

const STEP_LABELS = ['Connect to Vector Database', 'Configure Embedding Model', 'Query & Retrieve'];
const LAST_STEP = STEP_LABELS.length - 1;

export default function RagRetrieval(_scope: OrgScope): JSX.Element {
  const [vectorStore, setVectorStore] = useState<VectorStoreConfig | null>(null);
  const [embedding, setEmbedding] = useState<EmbeddingConfig | null>(null);
  const [query, setQuery] = useState<RetrievalQuery>(DEFAULT_RETRIEVAL_QUERY);
  const [activeStep, setActiveStep] = useState(0);
  const retrieve = useRetrieveChunks();
  const orgUuid = useOrgUuid();
  const subscriptions = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions.data?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);

  const stepValid = [isVectorStoreValid(vectorStore), isEmbeddingValid(embedding), isRetrievalQueryValid(query)];

  if (!isRagIngestionEnabled()) {
    return <ComingSoon title="Coming Soon" description="RAG Retrieval is currently under development." />;
  }

  const title = (
    <PageTitle>
      <PageTitle.Header>Retrieval</PageTitle.Header>
    </PageTitle>
  );

  if (subscriptions.isLoading) {
    return (
      <PageContent>
        {title}
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }
  if (!isSubscribed) {
    return (
      <PageContent>
        {title}
        <RagUpgradeRequired orgUuid={orgUuid} />
      </PageContent>
    );
  }

  const runRetrieve = () => {
    if (vectorStore && embedding) retrieve.mutate({ vectorStore, embedding, query });
  };

  return (
    <PageContent>
      {title}
      <Stack direction="row" gap={4} alignItems="flex-start" sx={{ mt: 3 }}>
        <Box sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0, pt: 1 }}>
          <VerticalStepper activeStep={activeStep} steps={STEP_LABELS} />
        </Box>
        <Box sx={{ flex: 1, maxWidth: 900, mt: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
            Retrieve Chunks from Vector Database
          </Typography>

          {retrieve.isError && (
            <Alert severity="error" variant="outlined" onClose={() => retrieve.reset()} sx={{ mb: 3 }}>
              Failed to retrieve chunks. Check the{' '}
              <Link component="button" type="button" onClick={() => setActiveStep(0)} sx={{ verticalAlign: 'baseline' }}>
                vector store
              </Link>{' '}
              and{' '}
              <Link component="button" type="button" onClick={() => setActiveStep(1)} sx={{ verticalAlign: 'baseline' }}>
                embedding configuration
              </Link>
              .
            </Alert>
          )}

          {activeStep === 0 && <VectorStoreStep value={vectorStore} onChange={setVectorStore} />}
          {activeStep === 1 && <EmbeddingModelStep value={embedding} onChange={setEmbedding} />}
          {activeStep === 2 && <QueryRetrieveStep value={query} onChange={setQuery} chunks={retrieve.data?.retrieved_chunks ?? []} hasQueried={retrieve.isSuccess} />}

          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            <Button variant="outlined" disabled={activeStep === 0} onClick={() => setActiveStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            {activeStep < LAST_STEP ? (
              <Button variant="contained" disabled={!stepValid[activeStep]} onClick={() => setActiveStep((s) => Math.min(LAST_STEP, s + 1))}>
                Next
              </Button>
            ) : (
              <Button variant="contained" disabled={!stepValid[LAST_STEP] || retrieve.isPending} startIcon={retrieve.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={runRetrieve}>
                {retrieve.isPending ? 'Retrieving…' : 'Retrieve'}
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </PageContent>
  );
}
