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

import { Alert, Box, Button, CircularProgress, Divider, Drawer, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../common/TextField';
import { CheckCircle2, Copy, Plus, Trash2, X, XCircle } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState } from 'react';
import { useExecutionArguments } from '../../hooks/useExecutions';
import type { TaskExecution } from '../../types/executions';
import { executionIdTail } from '../../utils/executionStatus';
import { useTriggerComponent } from '../../hooks/useExecutions';

interface ExecutionDrawerProps {
  execution: TaskExecution | null;
  open: boolean;
  onClose: () => void;
  onRunSuccess?: () => void;
  orgHandler: string;
  projectHandler: string;
  componentHandler: string;
  projectId: string;
  componentId: string;
  releaseId: string;
}

function formatTriggeredAt(unixSeconds: string): string {
  if (!unixSeconds) return '—';
  const date = new Date(parseInt(unixSeconds, 10) * 1000);
  const today = new Date();
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `Today at ${timeStr}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${timeStr}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ` at ${timeStr}`;
}

function isTerminal(status: string): boolean {
  const v = status?.toLowerCase();
  return v === 'succeeded' || v === 'success' || v === 'failed' || v === 'failure';
}

function StatusIcon({ status }: { status: string }) {
  const v = status?.toLowerCase();
  if (!isTerminal(status)) return <CircularProgress size={16} />;
  if (v === 'succeeded' || v === 'success') return <CheckCircle2 size={16} color="green" />;
  return <XCircle size={16} color="red" />;
}

const drawerSx = {
  '& .MuiDrawer-paper': {
    width: 680,
    position: 'fixed',
    top: 64,
    height: 'calc(100% - 64px)',
    display: 'flex',
    flexDirection: 'column',
  },
};

export default function ExecutionDrawer({ execution, open, onClose, onRunSuccess, orgHandler, projectId, componentId, releaseId }: ExecutionDrawerProps) {
  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    onClose();
  };

  const [copied, setCopied] = useState(false);
  const [titleCopied, setTitleCopied] = useState(false);
  const [args, setArgs] = useState<string[]>(['']);
  const [runError, setRunError] = useState<string | null>(null);

  const trigger = useTriggerComponent();

  const { data: fetchedArgs, isLoading: argsLoading } = useExecutionArguments(execution?.runId ?? '', componentId, releaseId, open && !!execution?.runId);

  // Populate editable args from fetched data
  useEffect(() => {
    if (fetchedArgs) {
      setArgs(fetchedArgs.length > 0 ? fetchedArgs.map((a) => a.argumentValue) : ['']);
    }
  }, [fetchedArgs]);

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      setArgs(['']);
      setRunError(null);
    }
  }, [open]);

  const handleCopy = () => {
    if (!execution?.revisionId) return;
    navigator.clipboard.writeText(execution.revisionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Copies the untrimmed name — the header shows only the identifying tail.
  const handleCopyTitle = () => {
    if (!execution) return;
    navigator.clipboard.writeText(`Execution: ${execution.id}`).then(() => {
      setTitleCopied(true);
      setTimeout(() => setTitleCopied(false), 1500);
    });
  };

  const handleRun = () => {
    setRunError(null);
    const execArgs = args.filter((a) => a.trim() !== '').map((a) => ({ argument_name: '', argument_value: a }));
    trigger.mutate(
      { orgHandler, projectId, componentId, releaseId, args: execArgs },
      {
        onSuccess: () => {
          onClose();
          onRunSuccess?.();
        },
        onError: (err) => setRunError(err instanceof Error ? err.message : 'Failed to execute'),
      },
    );
  };

  return (
    <Drawer anchor="right" open={open} onClose={handleClose} variant="temporary" sx={drawerSx}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {execution ? `Execution: ${executionIdTail(execution.id)}` : 'Execution'}
          </Typography>
          {execution && (
            <Tooltip title={titleCopied ? 'Copied!' : 'Copy execution name'}>
              <IconButton size="small" onClick={handleCopyTitle} aria-label="Copy execution name">
                <Copy size={12} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        <IconButton size="small" aria-label="close" onClick={handleClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      {execution && (
        <>
          <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Info card */}
            <Box sx={{ px: 2, pt: 2 }}>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 2, py: 1.5 }}>
                <Stack direction="row" gap={4}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Triggered at
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                      {formatTriggeredAt(execution.startTime)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Revision
                    </Typography>
                    <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
                      <StatusIcon status={execution.status} />
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {execution.revisionId ? execution.revisionId.substring(0, 10) : '—'}
                      </Typography>
                      {execution.revisionId && (
                        <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                          <IconButton size="small" onClick={handleCopy} aria-label="Copy revision ID">
                            <Copy size={12} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            </Box>

            {/* Tabs */}
            <Box sx={{ px: 2, mt: 2 }}>
              <Tabs value={0}>
                <Tab label="Arguments" value={0} />
              </Tabs>
              <Divider />
            </Box>

            {/* Arguments tab */}
            <Box sx={{ px: 2, py: 2 }}>
              {argsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                  <CircularProgress size={24} color="primary" />
                </Box>
              ) : (
                <Stack gap={1.5}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      Arguments
                    </Typography>
                    <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1, fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{JSON.stringify(args)}</Box>
                  </Box>
                  {args.map((arg, index) => (
                    <Stack key={index} gap={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        Arg {index + 1}
                      </Typography>
                      <Stack direction="row" gap={1} alignItems="center">
                        <TextField size="small" fullWidth placeholder="Enter the argument" value={arg} onChange={(e) => setArgs((prev) => prev.map((a, i) => (i === index ? e.target.value : a)))} />
                        <IconButton size="small" aria-label="Remove argument" disabled={args.length === 1} onClick={() => setArgs((prev) => prev.filter((_, i) => i !== index))}>
                          <Trash2 size={14} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  ))}

                  <Button variant="text" size="small" startIcon={<Plus size={14} />} onClick={() => setArgs((prev) => [...prev, ''])} sx={{ alignSelf: 'flex-start', px: 0 }}>
                    Add Argument
                  </Button>

                  {runError && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {runError}
                    </Alert>
                  )}
                </Stack>
              )}
            </Box>
          </Box>

          {/* Footer */}
          {!argsLoading && (
            <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="contained" onClick={handleRun} disabled={trigger.isPending || !releaseId} startIcon={trigger.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
                {trigger.isPending ? 'Executing…' : 'Execute'}
              </Button>
            </Stack>
          )}
        </>
      )}
    </Drawer>
  );
}
