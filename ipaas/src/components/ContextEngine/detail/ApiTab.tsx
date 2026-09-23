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
import type { JSX } from 'react';
import { buildQueryCurl, queryEndpointUrl, resolveEngineBaseUrl } from '../../../utils/contextEngine';
import CodeViewer from '../../CodeViewer';
import ExposureToggle from './ExposureToggle';
import { endpointFieldSx, endpointRowSx, mutedSx } from '../styles';
import type { ContextEngineDetail } from '../../../types/contextEngine';

interface ApiTabProps {
  engine: ContextEngineDetail;
}

/** Expose as API — the REST query endpoint, how to authenticate, and a ready-to-run request. */
export default function ApiTab({ engine }: ApiTabProps): JSX.Element {
  const base = resolveEngineBaseUrl(window.API_CONFIG.contextEngineApiUrl, window.location.origin);
  const endpoint = queryEndpointUrl(base);

  return (
    <Box sx={{ maxWidth: 900 }}>
      <ExposureToggle engine={engine} surface="api" title="REST API" description="Integrations call one endpoint with a question and receive an answer with source-linked evidence." />

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        Query endpoint
      </Typography>
      <Box sx={endpointRowSx}>
        <TextField size="small" value={endpoint} slotProps={{ input: { readOnly: true } }} inputProps={{ 'aria-label': 'Query endpoint' }} sx={endpointFieldSx} />
      </Box>

      <Stack gap={2} sx={{ mb: 3 }}>
        <Alert severity="info" variant="outlined">
          Requests carry the caller's platform bearer token. The engine answers only for members of the roles granted on the Access tab; everyone else receives not-found, never a hint that the engine exists.
        </Alert>
        <Typography variant="body2" sx={mutedSx}>
          Use <code>mode: "answer"</code> for a composed answer, or <code>mode: "context"</code> for the raw passages. Each response includes evidence ids you can open with <code>GET /v1/evidence/{'{id}'}</code> and a trace id for{' '}
          <code>GET /v1/queries/{'{queryId}'}/trace</code>.
        </Typography>
      </Stack>

      <CodeViewer title="Example request" language="text" code={buildQueryCurl(base, engine.id)} showCopyButton wrapLongLines />
    </Box>
  );
}
