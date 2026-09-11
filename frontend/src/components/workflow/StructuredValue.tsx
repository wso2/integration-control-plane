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

import { Box, Chip, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Braces, Copy } from '@wso2/oxygen-ui-icons-react';
import { useState, type ReactElement } from 'react';
import CodeViewer from '../CodeViewer';
import { humanizeKey } from './helpers';
import { IdText, SectionCard, WorkflowIdLink } from './shared';
import DateTime from '../DateTime';

// Renders a JSON value as labelled rows.
// Ids are bare UUIDs (child ids are name-<uuid>), so shape alone can't identify one: the key must claim it too.
const ENDS_WITH_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_KEY = /(workflowid|taskid|reviewid|instanceid)$/i;
const isWorkflowId = (key: string, value: unknown): value is string => typeof value === 'string' && (/^(workflow|humantask|reviewactivity|childwf|childagent)-/.test(value) || (ID_KEY.test(key) && ENDS_WITH_UUID.test(value)));

const BARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export default function StructuredValue({ title, raw, environmentId, collapsible, readOnly }: { title: string; raw: string; environmentId?: string; collapsible?: boolean; readOnly?: boolean }): ReactElement {
  const [showRaw, setShowRaw] = useState(false);

  let parsed: unknown;
  let parseFailed = false;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parseFailed = true;
  }

  const isFormable = !parseFailed && parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  const isBare = !parseFailed && !isFormable && (parsed === null || typeof parsed !== 'object');

  const actions = (
    <>
      <Tooltip title={showRaw ? 'Show as a form' : 'Show the raw JSON'}>
        <IconButton size="small" aria-label={`toggle raw ${title.toLowerCase()}`} onClick={() => setShowRaw((v) => !v)} sx={{ p: 0.25, color: showRaw ? 'primary.main' : 'inherit' }}>
          <Braces size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Copy ${title.toLowerCase()}`}>
        <IconButton size="small" aria-label={`copy ${title.toLowerCase()}`} onClick={() => navigator.clipboard.writeText(raw)} sx={{ p: 0.25 }}>
          <Copy size={14} />
        </IconButton>
      </Tooltip>
    </>
  );
  const badge = readOnly ? <Chip label="Read-only" size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} /> : undefined;

  let body: ReactElement;
  if (showRaw || parseFailed || (!isFormable && !isBare)) {
    body = (
      <Box sx={{ minWidth: 0, overflow: 'auto', maxHeight: '32vh' }}>
        <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {raw}
        </Box>
      </Box>
    );
  } else if (isBare) {
    body = <Typography sx={{ fontFamily: 'monospace', fontSize: 12.5, wordBreak: 'break-word' }}>{parsed === null ? '—' : String(parsed)}</Typography>;
  } else {
    body = <ObjectRows value={parsed as Record<string, unknown>} depth={0} environmentId={environmentId} />;
  }

  return (
    <SectionCard title={title} badge={badge} actions={actions} collapsible={collapsible}>
      {body}
    </SectionCard>
  );
}

const isPrimitiveArray = (v: unknown): v is Array<string | number | boolean | null> => Array.isArray(v) && v.every((e) => e === null || ['string', 'number', 'boolean'].includes(typeof e));

// An object as labelled rows; nested plain objects become indented sub-forms.
function ObjectRows({ value, depth, environmentId }: { value: Record<string, unknown>; depth: number; environmentId?: string }): ReactElement {
  const entries = Object.entries(value);
  return (
    <Stack gap={0.5} sx={{ minWidth: 0, pl: depth * 1.5, borderLeft: depth > 0 ? '2px solid' : 'none', borderColor: 'divider' }}>
      {entries.map(([key, v]) => {
        const label = (
          <Typography variant="caption" sx={{ color: 'text.secondary', width: 132, flexShrink: 0, overflowWrap: 'break-word' }} title={key}>
            {humanizeKey(key)}
          </Typography>
        );
        if (isWorkflowId(key, v) && environmentId) {
          return (
            <Stack key={key} direction="row" gap={1} alignItems="baseline" sx={{ minWidth: 0 }}>
              {label}
              <WorkflowIdLink workflowId={v} environmentId={environmentId} truncate copy />
            </Stack>
          );
        }
        if (typeof v === 'string' && BARE_UUID.test(v)) {
          return (
            <Stack key={key} direction="row" gap={1} alignItems="baseline" sx={{ minWidth: 0 }}>
              {label}
              <IdText id={v} />
            </Stack>
          );
        }
        if (typeof v === 'string' && ISO_TIMESTAMP.test(v)) {
          return (
            <Stack key={key} direction="row" gap={1} alignItems="baseline" sx={{ minWidth: 0 }}>
              {label}
              <Typography variant="body2" title={v} sx={{ minWidth: 0, fontSize: 12.5 }}>
                <DateTime value={v} />
              </Typography>
            </Stack>
          );
        }
        if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
          return (
            <Stack key={key} direction="row" gap={1} alignItems="baseline" sx={{ minWidth: 0 }}>
              {label}
              <Typography variant="body2" sx={{ minWidth: 0, wordBreak: 'break-word', fontFamily: typeof v === 'string' && /id$/i.test(key) ? 'monospace' : undefined, fontSize: 12.5 }}>
                {v === null ? '—' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v === '' ? '—' : v)}
              </Typography>
            </Stack>
          );
        }
        if (isPrimitiveArray(v)) {
          return (
            <Stack key={key} direction="row" gap={1} alignItems="baseline" sx={{ minWidth: 0 }}>
              {label}
              <Typography variant="body2" sx={{ minWidth: 0, wordBreak: 'break-word', fontSize: 12.5 }}>
                {v.length === 0 ? '—' : v.map((e) => (e === null ? '—' : String(e))).join(', ')}
              </Typography>
            </Stack>
          );
        }
        if (v !== null && typeof v === 'object' && !Array.isArray(v) && depth < 3) {
          return (
            <Box key={key} sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                {humanizeKey(key)}
              </Typography>
              <ObjectRows value={v as Record<string, unknown>} depth={depth + 1} environmentId={environmentId} />
            </Box>
          );
        }
        return <CodeViewer key={key} code={JSON.stringify(v, null, 2)} language="json" title={humanizeKey(key)} height="14vh" expandable showLineNumbers={false} />;
      })}
    </Stack>
  );
}
