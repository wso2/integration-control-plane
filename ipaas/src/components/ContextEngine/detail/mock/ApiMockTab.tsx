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

import { Alert, Box, Button, ListingTable, Stack, Typography } from '@wso2/oxygen-ui';
import { MessageSquare } from '@wso2/oxygen-ui-icons-react';
import { useMemo, type JSX, type ReactNode } from 'react';
import { useAskedQuestions } from '../../../../hooks/contextQuestions';
import { useAppNavigate } from '../../../../hooks/useAppNavigate';
import { contextEngineUrl } from '../../../../paths';
import { HTTP_METHOD_COLORS } from '../../../../utils/httpMethods';
import { buildQueryCurl, buildQueryResponseExample, contextEndpointUrl, playgroundSearch } from '../../../../utils/contextEngine';
import CodeViewer from '../../../CodeViewer';
import OperationHeader from '../../../Overview/_shared/bodies/OperationHeader';
import OperationTile from '../../../Overview/_shared/bodies/OperationTile';
import CopyButton from '../../../Overview/integration-as-api/CopyButton';
import * as consumption from '../../../Overview/integration-as-api/apiConsumption.styles';
import AccessOffAlert from '../AccessOffAlert';
import AccessSwitch from '../AccessSwitch';
import SurfaceHeader from '../SurfaceHeader';
import { mutedSx } from '../../styles';
import MockTokensPanel from './MockTokensPanel';
import type { ContextEngineDetail, ContextEngineExposure } from '../../../../types/contextEngine';

const POST_COLORS = HTTP_METHOD_COLORS.POST;

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

/**
 * The fields a query takes, on the REST route and the MCP tool alike, under the first column's name. The search
 * field is listed only where the engine offers agentic search; elsewhere the engine refuses it.
 */
export function QueryFields({ name, exposure }: { name: string; exposure: Pick<ContextEngineExposure, 'agenticSearch'> }): JSX.Element {
  const rows: ReactNode[][] = [
    [<Mono>query</Mono>, 'string, required', 'Your question, in plain language.'],
    ...(exposure.agenticSearch
      ? [
          [
            <Mono>search</Mono>,
            'string, optional',
            <>
              {'How to search: '}
              <Mono>deterministic</Mono>
              {" is the engine's standard search, and "}
              <Mono>agentic</Mono>
              {' has a model follow links between records, for questions whose answer spans several of them.'}
            </>,
          ],
        ]
      : []),
    [<Mono>limit</Mono>, 'number, optional', 'The most statements to return with deterministic search; agentic search returns everything it finds.'],
  ];
  return <FieldTable head={[name, 'Type', 'Description']} rows={rows} />;
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

function OperationDrawer({ exposure, url, curl, response }: { exposure: ContextEngineExposure; url: string; curl: string; response: string }): JSX.Element {
  return (
    <Stack gap={2.5}>
      <OperationHeader
        badgeLabel="POST"
        label="/v1/context"
        colors={POST_COLORS}
        description={
          exposure.answers
            ? 'Returns the statements the caller may read for a query, with the evidence they stand on, and an answer written from exactly those statements.'
            : 'Returns the statements the caller may read for a query, in rank order, with the evidence they stand on.'
        }
      />
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Request body
        </Typography>
        <QueryFields name="Field" exposure={exposure} />
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Response state
        </Typography>
        <FieldTable
          head={['state', 'Meaning']}
          rows={[
            [<Mono>completed</Mono>, exposure.answers ? 'The search ran. answer holds the answer, or null when the answer model failed.' : 'The search ran. statements hold what it found.'],
            [<Mono>insufficient_evidence</Mono>, exposure.answers ? 'Nothing the caller may read answers the query, and answer is null.' : 'Nothing the caller may read answers the query.'],
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
  const base = engine.publicApiUrl ?? '';
  const asked = useAskedQuestions(engine.id);
  // A question this engine has answered, so the example reads like its content; the stock one otherwise.
  const question = useMemo(() => asked.find((q) => (!engine.createdAt || q.askedAt >= engine.createdAt) && q.outcome === 'answered')?.question, [asked, engine.createdAt]);
  // One route: an engine that answers puts the answer beside the statements. The example leaves the search to the engine.
  const curl = buildQueryCurl(base, question);
  const response = buildQueryResponseExample(engine.exposure.answers, playgroundSearch(engine.exposure));
  const description = engine.exposure.answers ? 'Send a question and get an answer, with the statements it was written from.' : 'Send a question and get the statements that answer it.';

  if (!engine.publicApiUrl) {
    return (
      <Box sx={{ maxWidth: 900 }}>
        <SurfaceHeader title="REST API" description={description} />
        <Alert severity="info" variant="outlined">
          The public endpoint isn&apos;t ready yet. It appears here once the engine&apos;s gateway route is set up.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      <SurfaceHeader title="REST API" description={description} action={engine.access && <AccessSwitch engineId={engine.id} access={engine.access} surface="api" />} />
      {engine.access?.api === false && <AccessOffAlert surface="api" />}
      <Button variant="text" startIcon={<MessageSquare size={16} />} onClick={() => navigate(contextEngineUrl(orgHandle, engine.id, 'playground'))} sx={{ mb: 2, ml: -1 }}>
        Try it in the Playground
      </Button>

      <BaseUrl label="Base URL" url={`${base.replace(/\/$/, '')}/v1`} />

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Endpoints
      </Typography>
      <Stack gap={1}>
        <OperationTile
          badgeLabel="POST"
          label="/v1/context"
          colors={POST_COLORS}
          drawerTitle="Endpoint details"
          drawerContent={<OperationDrawer exposure={engine.exposure} url={contextEndpointUrl(base)} curl={curl} response={response} />}
        />
      </Stack>

      <MockTokensPanel engineId={engine.id} />

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
        Example
      </Typography>
      <Typography variant="body2" sx={{ ...mutedSx, mb: 1.5 }}>
        Replace <code>$API_KEY</code> with one of this engine&apos;s API keys. The mock tokens above don&apos;t work with the engine.
      </Typography>
      <CodeViewer title="Request" language="text" code={curl} showCopyButton wrapLongLines />
      <Box sx={{ mt: 2 }}>
        <CodeViewer title="Response" language="json" code={response} showCopyButton wrapLongLines />
      </Box>
    </Box>
  );
}
