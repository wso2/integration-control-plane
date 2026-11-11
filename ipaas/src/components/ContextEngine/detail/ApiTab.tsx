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

import { Alert, Box, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useEffect, type JSX } from 'react';
import { useConnectViewedFlag } from '../../../hooks/useContextEngine';
import { useSearchParams } from 'react-router';
import { answerEndpointUrl, buildQueryCurl, buildQueryResponseExample, contextEndpointUrl } from '../../../utils/contextEngine';
import ApiKeysSection from './ApiKeysSection';
import CodeViewer from '../../CodeViewer';
import SurfaceHeader from './SurfaceHeader';
import { endpointFieldSx, endpointRowSx, mutedSx } from '../styles';
import type { ContextEngineDetail } from '../../../types/contextEngine';

interface ApiTabProps {
  engine: ContextEngineDetail;
}

/** Expose as API — the engine's public endpoints, how to authenticate, and a ready-to-run request. */
export default function ApiTab({ engine }: ApiTabProps): JSX.Element {
  // Opening this tab is what completes the Overview's Connect an agent step.
  const { markConnectViewed } = useConnectViewedFlag(engine.id, engine.createdAt);
  useEffect(() => markConnectViewed(), [markConnectViewed]);
  const [params] = useSearchParams();
  // "Use in API" on the Playground lands here with the question, and the answer route when it was asked for an answer.
  const question = params.get('q')?.trim() || undefined;
  const route = params.get('mode') === 'answer' && engine.exposure.answers ? 'answer' : 'context';
  const base = engine.publicApiUrl ?? '';
  const endpoints = [
    { label: 'Context', url: contextEndpointUrl(base), off: false },
    // Served only when the engine offers answers; otherwise it returns not-found.
    { label: 'Answer', url: answerEndpointUrl(base), off: !engine.exposure.answers },
  ];

  if (!engine.publicApiUrl) {
    return (
      <Box sx={{ maxWidth: 900 }}>
        <SurfaceHeader title="REST API" description="Send a question and get passages or a cited answer." />
        <Alert severity="info" variant="outlined">
          The public endpoint isn&apos;t ready yet. It appears here once the engine&apos;s gateway route is set up.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      <SurfaceHeader title="REST API" description="Send a question and get passages or a cited answer." />

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Endpoints
      </Typography>
      {endpoints.map((e) => (
        <Box key={e.label} sx={endpointRowSx}>
          <TextField size="small" label={e.label} value={e.url} disabled={e.off} helperText={e.off ? 'Answers are turned off for this engine.' : undefined} slotProps={{ input: { readOnly: true } }} sx={endpointFieldSx} />
        </Box>
      ))}

      <Stack gap={2} sx={{ mb: 3 }}>
        <Alert severity="info">
          Requests carry one of this engine's API keys in the <code>X-API-Key</code> header. The engine's gateway checks the key; a request without a valid one never reaches the engine.
        </Alert>
        <Typography variant="body2" sx={mutedSx}>
          Send <code>{'{"question": "…"}'}</code>. In <code>answer</code>, <code>[n]</code> cites the nth passage. With no answer, <code>state</code> is <code>"insufficient_evidence"</code>.
        </Typography>
      </Stack>

      <ApiKeysSection engineId={engine.id} />

      <CodeViewer title="Example request" language="text" code={buildQueryCurl(base, question, route)} showCopyButton wrapLongLines />
      <Box sx={{ mt: 2 }}>
        <CodeViewer title="Example response" language="json" code={buildQueryResponseExample(engine.sources[0]?.id)} showCopyButton wrapLongLines />
      </Box>
    </Box>
  );
}
