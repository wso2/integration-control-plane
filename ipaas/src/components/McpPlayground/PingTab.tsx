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

import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { Radio } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import type { McpPingResult } from '../../types/mcp';

interface PingTabProps {
  ping: () => Promise<McpPingResult>;
}

/** A simple connectivity check — pings the connected server and reports latency. */
export default function PingTab({ ping }: PingTabProps): JSX.Element {
  const [result, setResult] = useState<McpPingResult | null>(null);
  const [pinging, setPinging] = useState(false);

  const doPing = async () => {
    setPinging(true);
    try {
      setResult(await ping());
    } finally {
      setPinging(false);
    }
  };

  return (
    <Stack gap={2} sx={{ p: 2.5 }}>
      <Typography variant="body2" color="text.secondary">
        Send a ping to verify the server is reachable and responsive.
      </Typography>
      <Box>
        <Button variant="contained" size="small" startIcon={pinging ? <CircularProgress size={14} color="inherit" /> : <Radio size={16} />} disabled={pinging} onClick={() => void doPing()}>
          {pinging ? 'Pinging…' : 'Ping server'}
        </Button>
      </Box>
      {result && (
        <Stack direction="row" alignItems="center" gap={1}>
          <Chip label={result.success ? 'Reachable' : 'Failed'} size="small" color={result.success ? 'success' : 'error'} variant="outlined" />
          <Typography variant="body2" color="text.secondary">
            {result.success ? `Responded in ${result.latencyMs}ms` : (result.error ?? 'Ping failed')}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
