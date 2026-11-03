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

import { Box, ButtonBase, CircularProgress, DrawerPanel, Stack, Typography } from '@wso2/oxygen-ui';
import { CheckCircle2, FileText, Inbox, XCircle } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { TaskExecution } from '../../types/executions';
import { executionPhase } from '../../utils/executionStatus';

interface ExecutionsDrawerProps {
  open: boolean;
  onClose: () => void;
  executions: TaskExecution[];
  /** True when a draft test exists; shown at the top and re-applyable. */
  hasDraft: boolean;
  onSelectDraft: () => void;
  /** Apply a past execution's saved arguments to the form. */
  onSelectExecution: (execution: TaskExecution) => void;
}

function StatusIcon({ status }: { status: string }): JSX.Element {
  const phase = executionPhase(status);
  if (phase === 'succeeded') return <CheckCircle2 size={16} color="green" />;
  if (phase === 'failed' || phase === 'terminated') return <XCircle size={16} color="red" />;
  return <CircularProgress size={14} />;
}

function formatTriggeredAt(unixSeconds: string): string {
  if (!unixSeconds) return '—';
  const date = new Date(parseInt(unixSeconds, 10) * 1000);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const rowSx = { width: '100%', textAlign: 'left', border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 2, py: 1.5, '&:hover': { bgcolor: 'action.hover' } } as const;

/**
 * Lists the saved draft (if any) and recent executions. Selecting a row applies its
 * runtime-argument values back into the Test form, mirroring Devant's executions
 * selector. Read-only otherwise.
 */
export default function ExecutionsDrawer({ open, onClose, executions, hasDraft, onSelectDraft, onSelectExecution }: ExecutionsDrawerProps): JSX.Element {
  return (
    <DrawerPanel open={open} onClose={onClose} width={440}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>Executions</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        <Stack gap={1}>
          {hasDraft && (
            <ButtonBase onClick={onSelectDraft} sx={{ ...rowSx, borderStyle: 'dashed', borderColor: 'primary.main' }}>
              <Stack direction="row" alignItems="center" gap={1.5} sx={{ width: '100%' }}>
                <FileText size={16} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Draft
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Unsaved runtime arguments
                  </Typography>
                </Box>
              </Stack>
            </ButtonBase>
          )}

          {executions.length === 0 && !hasDraft ? (
            <Stack alignItems="center" gap={1} sx={{ py: 6, color: 'text.secondary' }}>
              <Inbox size={28} />
              <Typography variant="body2" color="text.secondary">
                No executions yet
              </Typography>
            </Stack>
          ) : (
            executions.map((e) => (
              <ButtonBase key={e.runId || e.id} onClick={() => onSelectExecution(e)} disabled={!e.runId} sx={rowSx}>
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ width: '100%' }}>
                  <StatusIcon status={e.status} />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {e.status || 'Unknown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {formatTriggeredAt(e.startTime)}
                    </Typography>
                  </Box>
                  {e.runId && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {e.runId.slice(0, 8)}
                    </Typography>
                  )}
                </Stack>
              </ButtonBase>
            ))
          )}
        </Stack>
      </DrawerPanel.Body>
    </DrawerPanel>
  );
}
