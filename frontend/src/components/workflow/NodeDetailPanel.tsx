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

import { alpha, Box, Button, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import { Clock, X } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import type { ExecutionGraphNode } from '../../api/workflows';
import StructuredValue from './StructuredValue';
import { formatDuration, humanizeKey, parseModelCall, splitQualifiedName, type ModelCallView, type NodeExecutionDetail } from './helpers';
import { SectionCard, StatusChip, WorkflowIdLink } from './shared';
import { typeLabel } from './graphVisuals';

// A model call as a conversation: the message it was answering, then its reply, with the raw input one click away.
function ModelCallSections({ view, detail, environmentId }: { view: ModelCallView; detail: NodeExecutionDetail; environmentId?: string }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <>
      {view.lastMessage && (
        <Stack gap={1}>
          <SectionCard
            title="Answering"
            badge={
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                {view.earlierCount > 0 ? `${view.earlierCount} earlier ${view.earlierCount === 1 ? 'message' : 'messages'} · ` : ''}
                {view.toolsOffered} {view.toolsOffered === 1 ? 'tool' : 'tools'} offered
              </Typography>
            }>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 0.5 }}>
              {view.lastMessage.role}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {view.lastMessage.text}
            </Typography>
          </SectionCard>
          {detail.input !== null && (
            <>
              <Button size="small" variant="text" onClick={() => setShowRaw((v) => !v)} sx={{ alignSelf: 'flex-start', px: 0.5, minWidth: 0 }}>
                {showRaw ? 'Hide Full Input' : 'Show Full Input'}
              </Button>
              {showRaw && <StructuredValue title="Full Input" raw={detail.input} environmentId={environmentId} />}
            </>
          )}
        </Stack>
      )}
      {view.assistantText !== null && (
        <SectionCard title="Replied">
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {view.assistantText}
          </Typography>
        </SectionCard>
      )}
      {view.toolCalls.length > 0 && (
        <SectionCard title="Called" badge={<Typography variant="caption" sx={{ color: 'text.disabled' }}>{`${view.toolCalls.length} ${view.toolCalls.length === 1 ? 'tool' : 'tools'}`}</Typography>}>
          <Stack gap={0.75}>
            {view.toolCalls.map((call, i) => (
              <Typography key={`${call.name}-${i}`} variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-word' }}>
                {call.name}({call.args})
              </Typography>
            ))}
          </Stack>
        </SectionCard>
      )}
      {view.structuredResult && detail.result !== null && <StructuredValue title="Result" raw={detail.result} environmentId={environmentId} />}
    </>
  );
}

// Side panel showing a selected node's execution time, input and result, mapped from the history.
export default function NodeDetailPanel({ node, detail, hasHistory, onClose, fullWidth = false, environmentId }: { node: ExecutionGraphNode; detail: NodeExecutionDetail; hasHistory: boolean; onClose: () => void; fullWidth?: boolean; environmentId?: string }) {
  const { task } = splitQualifiedName(node.label);
  const modelCall = parseModelCall(detail);

  return (
    <Box sx={{ width: fullWidth ? '100%' : { xs: '100%', md: '45%' }, flexShrink: 0, alignSelf: 'stretch' }}>
      <SectionCard
        title={task ?? node.label}
        badge={
          <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {typeLabel(node.type)}
            </Typography>
            {detail.status && <StatusChip status={detail.status} />}
            {detail.durationMs != null && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Clock size={13} />
                {formatDuration(detail.durationMs)}
              </Typography>
            )}
          </Stack>
        }
        actions={
          <IconButton size="small" aria-label="close node details" onClick={onClose}>
            <X size={16} />
          </IconButton>
        }>
        <Stack gap={2}>
          {detail.childWorkflowId && environmentId && (
            <Stack direction="row" gap={1} alignItems="baseline">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Instance
              </Typography>
              <WorkflowIdLink workflowId={detail.childWorkflowId} environmentId={environmentId} truncate copy />
            </Stack>
          )}
          {detail.callConfig && Object.keys(detail.callConfig).length > 0 && (
            <Stack direction="row" gap={1} sx={{ flexWrap: 'wrap' }}>
              {Object.entries(detail.callConfig).map(([key, value]) => {
                const label = key === 'stepId' ? 'Step' : key === 'retryOnError' ? 'Retries on Error' : humanizeKey(key);
                const text = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
                return (
                  <Typography key={key} variant="caption" sx={{ px: 1, py: 0.25, border: '1px solid', borderColor: 'divider', borderRadius: 1, color: 'text.secondary' }}>
                    {label}:{' '}
                    <Box component="span" sx={{ fontFamily: key === 'stepId' ? 'monospace' : undefined, color: 'text.primary' }}>
                      {text}
                    </Box>
                  </Typography>
                );
              })}
            </Stack>
          )}
          {!hasHistory ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              History is not available, so this step's input and result can't be shown.
            </Typography>
          ) : (
            <>
              {detail.error && (
                <Box sx={{ px: 1.5, py: 1, borderRadius: 1, border: '1px solid', borderColor: 'error.main', color: 'error.main', bgcolor: (t) => alpha(t.palette.error.main, 0.08) }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                    Error
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                    {detail.error}
                  </Typography>
                </Box>
              )}
              {modelCall ? (
                <ModelCallSections view={modelCall} detail={detail} environmentId={environmentId} />
              ) : (
                <>
                  {detail.input !== null ? (
                    <StructuredValue title="Input" raw={detail.input} environmentId={environmentId} />
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      No input recorded for this step.
                    </Typography>
                  )}
                  {detail.result !== null ? (
                    <StructuredValue title="Result" raw={detail.result} environmentId={environmentId} />
                  ) : (
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {detail.status === 'COMPLETED' ? 'This step completed with no return value.' : detail.status ? 'No result — this step has not completed.' : 'No result recorded for this step.'}
                    </Typography>
                  )}
                </>
              )}
            </>
          )}
        </Stack>
      </SectionCard>
    </Box>
  );
}
