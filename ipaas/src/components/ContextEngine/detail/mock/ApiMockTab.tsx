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

import { Alert, Box, Button, ListingTable, Stack, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import { MessageSquare } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { useAskedQuestions } from '../../../../hooks/contextQuestions';
import { useAppNavigate } from '../../../../hooks/useAppNavigate';
import { contextEngineUrl } from '../../../../paths';
import { HTTP_METHOD_COLORS } from '../../../../utils/httpMethods';
import { answerEndpointUrl, buildQueryCurl, contextEndpointUrl, resolveEngineBaseUrl } from '../../../../utils/contextEngine';
import CodeViewer from '../../../CodeViewer';
import OperationHeader from '../../../Overview/_shared/bodies/OperationHeader';
import OperationTile from '../../../Overview/_shared/bodies/OperationTile';
import CopyButton from '../../../Overview/integration-as-api/CopyButton';
import * as consumption from '../../../Overview/integration-as-api/apiConsumption.styles';
import SurfaceHeader from '../SurfaceHeader';
import { mutedSx } from '../../styles';
import MockTokensPanel from './MockTokensPanel';
import type { ContextEngineDetail } from '../../../../types/contextEngine';

const POST_COLORS = HTTP_METHOD_COLORS.POST;

/** The response shape with plainly placeholder values, so no one mistakes it for this engine's content (round 1, 13.3). */
function exampleResponse(route: 'context' | 'answer', sourceId = 'src_…'): string {
  return JSON.stringify(
    {
      state: 'completed',
      ...(route === 'answer' ? { answer: 'The answer, written from the passages, with [1] citing the first one.' } : {}),
      evidence: [{ id: 'evi_…', recordId: '<document id>', sourceId, passage: '<the passage text>', location: 'chunk:0' }],
      traceId: 'trace_…',
    },
    null,
    2,
  );
}
const tableSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' } as const;

/** A small field table, as the integration section's operation drawers show parameters. */
export function FieldTable({ head, rows }: { head: string[]; rows: ReactNode[][] }): JSX.Element {
  return (
    <ListingTable.Container elevation={0} sx={tableSx}>
      <ListingTable size="small">
        <ListingTable.Head>
          <ListingTable.Row>
            {head.map((h) => (
              <ListingTable.Cell key={h}>{h}</ListingTable.Cell>
            ))}
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {rows.map((r, i) => (
            <ListingTable.Row key={i}>
              {r.map((c, j) => (
                <ListingTable.Cell key={j}>{c}</ListingTable.Cell>
              ))}
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}

/** A field or value name in code type. */
export function Mono({ children }: { children: string }): JSX.Element {
  return (
    <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
      {children}
    </Typography>
  );
}

/** A base address with a copy button, and a warning when it is the console's own development proxy. */
export function BaseUrl({ label, url }: { label: string; url: string }): JSX.Element {
  const proxied = url.includes('context-engine-proxy');
  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={consumption.fieldLabel}>{label}</Typography>
      <Box sx={consumption.credField}>
        <Typography component="span" sx={consumption.credValue}>
          {url}
        </Typography>
        <CopyButton value={url} label={`Copy ${label.toLowerCase()}`} />
      </Box>
      {proxied && (
        <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.75 }}>
          This is the console's proxy, for local development. Apps and agents should call the engine's own address.
        </Typography>
      )}
    </Box>
  );
}

function OperationDrawer({ route, url, curl, response }: { route: 'context' | 'answer'; url: string; curl: string; response: string }): JSX.Element {
  return (
    <Stack gap={2.5}>
      <OperationHeader
        badgeLabel="POST"
        label={`/v1/${route}`}
        colors={POST_COLORS}
        description={route === 'answer' ? 'Answers a question from the passages the caller may read, citing them as [n].' : 'Returns the passages the caller may read that answer a question, best match first.'}
      />
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Request body
        </Typography>
        <FieldTable
          head={['Field', 'Type', 'Description']}
          rows={[
            [<Mono>question</Mono>, 'string, required', 'What to ask, in plain language.'],
            [<Mono>limit</Mono>, 'number, optional', 'How many passages to use.'],
          ]}
        />
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Response state
        </Typography>
        <FieldTable
          head={['state', 'Meaning']}
          rows={[
            [<Mono>completed</Mono>, route === 'answer' ? 'An answer, with [n] citing the nth item in evidence.' : 'Passages in evidence, best match first.'],
            [<Mono>insufficient_evidence</Mono>, 'Nothing the caller may read answers the question.'],
          ]}
        />
      </Box>
      <CodeViewer title="Example request" language="text" code={curl} showCopyButton wrapLongLines />
      <CodeViewer title="Example response" language="json" code={response} showCopyButton wrapLongLines />
      <Typography variant="caption" sx={mutedSx}>
        {url}
      </Typography>
    </Stack>
  );
}

/**
 * MOCK. The proposed API tab, beside the real one so the team can compare: the endpoints as the
 * integration section's operation tiles, access tokens as its Consumers panel, and an example
 * built from a question asked of this engine.
 */
export default function ApiMockTab({ engine, orgHandle }: { engine: ContextEngineDetail; orgHandle: string }): JSX.Element {
  const navigate = useAppNavigate();
  const base = resolveEngineBaseUrl(window.API_CONFIG.contextEngineApiUrl, window.location.origin);
  const asked = useAskedQuestions(engine.id);
  // A question this engine has answered, so the example reads like its content; the stock one otherwise.
  const question = useMemo(() => asked.find((q) => (!engine.createdAt || q.askedAt >= engine.createdAt) && q.outcome === 'answered')?.question, [asked, engine.createdAt]);
  const routes = engine.exposure.answers ? (['answer', 'context'] as const) : (['context'] as const);
  const [route, setRoute] = useState<'context' | 'answer'>(routes[0]);
  const urlOf = (r: 'context' | 'answer') => (r === 'answer' ? answerEndpointUrl(base) : contextEndpointUrl(base));

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Alert severity="warning" sx={{ mb: 3 }}>
        Mock: a proposed layout for review. Tokens created here are not real, and the engine does not accept them.
      </Alert>

      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
        <SurfaceHeader title="REST API" description="Send a question and get passages or a cited answer." />
        <Button variant="text" startIcon={<MessageSquare size={16} />} onClick={() => navigate(contextEngineUrl(orgHandle, engine.id, 'playground'))}>
          Try it in the Playground
        </Button>
      </Stack>

      <BaseUrl label="Base URL" url={`${base.replace(/\/$/, '')}/v1`} />

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Endpoints
      </Typography>
      <Stack gap={1}>
        {routes.map((r) => (
          <OperationTile
            key={r}
            badgeLabel="POST"
            label={`/v1/${r}`}
            colors={POST_COLORS}
            drawerTitle="Endpoint details"
            drawerContent={<OperationDrawer route={r} url={urlOf(r)} curl={buildQueryCurl(base, question, r)} response={exampleResponse(r, engine.sources[0]?.id)} />}
          />
        ))}
      </Stack>

      <MockTokensPanel engineId={engine.id} />

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
        Example
      </Typography>
      {routes.length > 1 && (
        <Tabs value={route} onChange={(_, v) => setRoute(v as 'context' | 'answer')} sx={{ mb: 1.5 }} aria-label="Example endpoint">
          {routes.map((r) => (
            <Tab key={r} value={r} label={r === 'answer' ? 'Answer' : 'Context'} />
          ))}
        </Tabs>
      )}
      <Typography variant="body2" sx={{ ...mutedSx, mb: 1.5 }}>
        Replace <code>$TOKEN</code> with a token from Access tokens.
      </Typography>
      <CodeViewer title="Request" language="text" code={buildQueryCurl(base, question, route)} showCopyButton wrapLongLines />
      <Box sx={{ mt: 2 }}>
        <CodeViewer title="Response" language="json" code={exampleResponse(route, engine.sources[0]?.id)} showCopyButton wrapLongLines />
      </Box>
    </Box>
  );
}
