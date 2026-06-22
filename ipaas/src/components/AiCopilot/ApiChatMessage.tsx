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

import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { AlertCircle, CheckCircle2, ChevronDown, Terminal } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import { prism } from 'react-syntax-highlighter/dist/esm/styles/prism';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import type { ApiChatExecutionResult } from '../../types/copilot';

// Only JSON is ever rendered here (API execution payloads).
SyntaxHighlighter.registerLanguage('json', json);

interface ParsedResult {
  resource?: { method?: string; inputs?: { requestBody?: unknown } };
  output?: { code?: number; path?: string; headers?: Record<string, unknown>; body?: unknown };
}

interface ApiChatMessageProps {
  executionResults: ApiChatExecutionResult[];
}

export default function ApiChatMessage({ executionResults }: ApiChatMessageProps): JSX.Element {
  const [expandedMap, setExpandedMap] = useState<Map<number, boolean>>(new Map());
  const [showJsonMap, setShowJsonMap] = useState<Map<number, boolean>>(new Map());

  const toggleExpanded = (id: number, expanded: boolean) => {
    setExpandedMap((prev) => new Map(prev).set(id, expanded));
  };

  const toggleJsonView = (id: number, show: boolean) => {
    setShowJsonMap((prev) => new Map(prev).set(id, show));
  };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ px: 2, py: 1 }}>
        <Terminal size={16} />
        <Typography variant="body2" fontWeight={600}>
          Execution Results
        </Typography>
      </Stack>
      <Divider />
      {executionResults.map((result) => {
        let parsed: ParsedResult | null = null;
        try {
          parsed = JSON.parse(result.result) as ParsedResult;
        } catch {
          return null;
        }
        const safeOutput = parsed?.output ?? { code: 0, path: '', headers: {}, body: null };
        const safeResource = parsed?.resource ?? { method: '', inputs: {} };
        const safeInputs = safeResource.inputs ?? {};
        const isSuccess = safeOutput.code >= 200 && safeOutput.code < 300;
        const isExpanded = expandedMap.get(result.id) ?? false;
        const showJson = showJsonMap.get(result.id) ?? false;
        const jsonPayload = showJson ? { input: safeInputs.requestBody ? { requestBody: safeInputs.requestBody } : undefined, output: safeOutput } : safeOutput.body;

        return (
          <Accordion key={result.id} expanded={isExpanded} onChange={(_, v) => toggleExpanded(result.id, v)} disableGutters sx={{ boxShadow: 'none', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ChevronDown size={16} />}>
              <Stack direction="row" alignItems="center" gap={1}>
                {isSuccess ? <CheckCircle2 size={16} color="var(--oxygen-palette-success-main)" /> : <AlertCircle size={16} color="var(--oxygen-palette-error-main)" />}
                <Typography variant="body2">
                  Executed {safeResource.method} {safeOutput.path}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Box sx={{ borderRadius: 1, overflow: 'hidden', fontSize: 12 }}>
                <SyntaxHighlighter language="json" style={prism} customStyle={{ margin: 0, maxHeight: 300 }}>
                  {JSON.stringify(jsonPayload, null, 2)}
                </SyntaxHighlighter>
              </Box>
              <Button variant="text" size="small" onClick={() => toggleJsonView(result.id, !showJson)} sx={{ mt: 0.5, p: 0, minWidth: 'unset' }}>
                {showJson ? 'Hide details' : 'More details'}
              </Button>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
