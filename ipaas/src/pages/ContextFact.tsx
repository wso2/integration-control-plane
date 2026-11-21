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

import { Alert, Box, Button, Chip, PageContent, PageTitle, Paper, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, ChevronRight } from '@wso2/oxygen-ui-icons-react';
import { type JSX } from 'react';
import { useLocation, useParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { isContextEngineEnabled, useContextEngine, useContextQueryResult, useRouteEngineId } from '../hooks/useContextEngine';
import { answerFact, evidenceBackTarget, evidenceVersionLabel, factNumberParam, restoreCase, sourceTypeName } from '../utils/contextEngine';
import { contextEngineUrl, contextEnginesUrl } from '../paths';
import NotFound from '../components/NotFound';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import { ChainStep, EvidenceText, UnavailableCard } from '../components/ContextEngine/detail/PassageParts';
import { mutedSx, provenanceChainSx, summaryCardHeaderSx, summaryCardSx, wrapSx } from '../components/ContextEngine/styles';
import type { ContextEvidence, ContextEvidenceLocationState, ContextFact as Fact, ContextSource } from '../types/contextEngine';
import type { OrgScope } from '../nav';

const cardSx = { ...summaryCardSx, height: 'auto' } as const;

/** Shaped like the page: the title, the fact's card, and one passage. */
function ContextFactSkeleton(): JSX.Element {
  return (
    <>
      <Skeleton variant="text" width={160} height={44} sx={{ mb: 2 }} />
      <Skeleton variant="rounded" height={112} />
      <Skeleton variant="text" width={180} sx={{ mt: 3 }} />
      <Skeleton variant="rounded" height={260} sx={{ mt: 1.5 }} />
    </>
  );
}

/** One end of the fact: its name and, when the graph has one, its kind. */
function Entity({ name, kind }: { name: string; kind?: string }): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
      <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
        {name}
      </Typography>
      {kind && <Chip size="small" variant="outlined" label={kind} />}
    </Stack>
  );
}

/** `passages` give the graph's lower-cased names back their spelling in the sources. */
function FactCard({ fact, passages }: { fact: Fact; passages: string[] }): JSX.Element {
  return (
    <Paper variant="outlined" sx={cardSx}>
      <Stack direction="row" alignItems="center" gap={1.25} flexWrap="wrap">
        <Entity name={restoreCase(fact.subject, passages)} kind={fact.subjectKind} />
        <Typography variant="body1" sx={mutedSx}>
          {fact.relation}
        </Typography>
        <Entity name={restoreCase(fact.object, passages)} kind={fact.objectKind} />
      </Stack>
      {fact.text && (
        <Typography variant="body2" sx={{ ...mutedSx, mt: 1.25, lineHeight: 1.6 }}>
          {fact.text}
        </Typography>
      )}
      {fact.linkedThrough && (
        <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 1 }}>
          Reached through {fact.linkedThrough}
        </Typography>
      )}
    </Paper>
  );
}

/** One passage the fact stands on: where it comes from, then its text. */
function SupportingPassage({ evidence, n, source }: { evidence: ContextEvidence; n: number; source?: ContextSource }): JSX.Element {
  return (
    <Paper variant="outlined" sx={cardSx}>
      <Box sx={summaryCardHeaderSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Evidence {n}
        </Typography>
      </Box>
      <Stack direction="row" alignItems="stretch" gap={1} sx={provenanceChainSx} aria-label={`Where evidence ${n} comes from`}>
        <ChainStep label="Source" value={source?.name ?? evidence.sourceId} detail={source ? sourceTypeName(source.type) : undefined} />
        <ChevronRight size={18} aria-hidden style={{ flexShrink: 0, opacity: 0.5 }} />
        <ChainStep label="ID" value={evidence.recordId} />
        <ChevronRight size={18} aria-hidden style={{ flexShrink: 0, opacity: 0.5 }} />
        <ChainStep label="Version" value={evidenceVersionLabel(evidence.sourceVersion)} />
      </Stack>
      <Box sx={{ mt: 2 }}>
        <EvidenceText evidence={evidence} />
      </Box>
    </Paper>
  );
}

/**
 * One statement behind an answer, opened from the answer's statement rail, with
 * the passages it stands on. A statement has no id of its own: it is the nth in
 * a stored answer's list, so the page reopens that query, and the engine checks
 * every passage again. A withheld answer may have lost statements, which would
 * shift the numbers, so its statements are not shown; like the passage page,
 * this page never says why.
 */
export default function ContextFact(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { queryId = '', factNumber } = useParams();
  const engineId = useRouteEngineId();
  const engine = useContextEngine(engineId);
  const result = useContextQueryResult(engineId, queryId || null);
  const { state } = useLocation() as { state: ContextEvidenceLocationState | null };

  if (!isContextEngineEnabled()) {
    return <ComingSoon title="Coming Soon" description="Context Engines are currently under development." />;
  }
  if (!engineId) {
    return (
      <PageContent fullWidth>
        <NotFound message="This link does not name a context engine." backTo={contextEnginesUrl(scope.org)} />
      </PageContent>
    );
  }

  // Back returns to the Playground when the fact was opened from there, so the conversation is still on screen.
  const backTarget = evidenceBackTarget(state, engine.data?.name);
  const toEngine = () => navigate(contextEngineUrl(scope.org, engineId, backTarget.tab));
  const back = (
    <Button startIcon={<ArrowLeft size={16} />} onClick={toEngine} sx={{ mb: 2 }}>
      {backTarget.label}
    </Button>
  );

  if (result.isLoading) {
    return (
      <PageContent fullWidth sx={wrapSx}>
        {back}
        <ContextFactSkeleton />
      </PageContent>
    );
  }

  // The engine answers 404 alike for a query that is gone and one that is not the reader's. A refetch that gets one
  // keeps the data read before it, so a 404 shows the statement as unavailable without reading that data.
  const gone = result.error instanceof HttpError && result.error.status === 404;
  if (result.isError && !gone) {
    return (
      <PageContent fullWidth sx={wrapSx}>
        {back}
        <Alert
          severity="error"
          variant="outlined"
          action={
            <Button color="inherit" size="small" onClick={() => result.refetch()}>
              Retry
            </Button>
          }>
          Couldn&apos;t load this statement. Please try again.
        </Alert>
      </PageContent>
    );
  }

  const found = gone ? null : answerFact(result.data, factNumberParam(factNumber));
  if (!found) {
    return (
      <PageContent fullWidth sx={wrapSx}>
        {back}
        <UnavailableCard
          title="This statement is no longer available"
          description="The items it came from may have changed or been removed, or you may not have access to them."
          onAsk={() => navigate(contextEngineUrl(scope.org, engineId, 'playground'))}
          backLabel={backTarget.label}
          onBack={toEngine}
        />
      </PageContent>
    );
  }

  const { fact, support } = found;
  const sourceOf = (id: string) => engine.data?.sources.find((s) => s.id === id);

  return (
    <PageContent fullWidth sx={wrapSx}>
      {back}
      <PageTitle>
        <PageTitle.Header>Statement</PageTitle.Header>
      </PageTitle>
      <FactCard fact={fact} passages={support.map((ev) => ev.passage)} />

      <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={2} sx={{ mt: 3, mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Supporting evidence
        </Typography>
        <Typography variant="caption" sx={mutedSx}>
          {support.length} evidence
        </Typography>
      </Stack>
      <Stack gap={2}>
        {support.map((ev, i) => (
          <SupportingPassage key={ev.id} evidence={ev} n={i + 1} source={sourceOf(ev.sourceId)} />
        ))}
      </Stack>
    </PageContent>
  );
}
