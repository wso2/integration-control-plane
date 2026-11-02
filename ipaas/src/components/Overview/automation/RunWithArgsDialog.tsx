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

import { Alert, Box, Button, CircularProgress, DrawerPanel, IconButton, Link, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useTriggerComponent } from '../../../hooks/useExecutions';

export interface RunWithArgsDialogProps {
  open: boolean;
  onClose: () => void;
  onRunSuccess?: (args: string[]) => void;
  envCritical?: boolean | null;
  orgHandler: string;
  projectId: string;
  componentId: string;
  releaseId: string;
}

export default function RunWithArgsDialog({ open, onClose, onRunSuccess, orgHandler, projectId, componentId, releaseId }: RunWithArgsDialogProps) {
  const [args, setArgs] = useState<string[]>(['']);
  const [runError, setRunError] = useState<string | null>(null);
  const trigger = useTriggerComponent();

  const handleAddArg = () => setArgs((prev) => [...prev, '']);

  const handleRemoveArg = (index: number) => setArgs((prev) => prev.filter((_, i) => i !== index));

  const handleChange = (index: number, val: string) => {
    setArgs((prev) => prev.map((arg, i) => (i === index ? val : arg)));
  };

  const handleRun = () => {
    setRunError(null);
    const execArgs = args.filter((a) => a.trim() !== '').map((a) => ({ argument_name: '', argument_value: a }));

    trigger.mutate(
      { orgHandler, projectId, componentId, releaseId, args: execArgs },
      {
        onSuccess: () => {
          const resolvedArgs = args.filter((a) => a.trim() !== '');
          handleClose();
          onRunSuccess?.(resolvedArgs);
        },
        onError: (err) => setRunError(err instanceof Error ? err.message : 'Failed to execute'),
      },
    );
  };

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    setArgs(['']);
    setRunError(null);
    onClose();
  };

  const previewJson = JSON.stringify(args);

  return (
    <DrawerPanel open={open} onClose={handleClose} width={440}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>Runtime Arguments</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
          <Typography variant="body2">
            To learn more about runtime arguments, see the{' '}
            <Link href="https://wso2.com/ballerina/icp/docs/" target="_blank" rel="noopener noreferrer" variant="body2">
              WSO2 Integration Platform Documentation
            </Link>
            .
          </Typography>
        </Alert>

        <Stack gap={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Arguments
            </Typography>
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1, fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{previewJson}</Box>
          </Box>

          {args.map((arg, index) => (
            <Stack key={index} gap={0.5}>
              <Typography variant="caption" color="text.secondary">
                Arg {index + 1}
              </Typography>
              <Stack direction="row" gap={1} alignItems="center">
                <TextField size="small" fullWidth placeholder="Enter the argument" value={arg} onChange={(e) => handleChange(index, e.target.value)} />
                <IconButton size="small" aria-label="Remove argument" disabled={args.length === 1} onClick={() => handleRemoveArg(index)}>
                  <Trash2 size={14} />
                </IconButton>
              </Stack>
            </Stack>
          ))}
        </Stack>

        <Button variant="text" size="small" startIcon={<Plus size={14} />} onClick={handleAddArg} sx={{ mt: 1.5, px: 0 }}>
          Add argument
        </Button>

        {runError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {runError}
          </Alert>
        )}
      </DrawerPanel.Body>

      <DrawerPanel.Footer>
        <Button variant="outlined" color="inherit" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleRun} disabled={trigger.isPending || !releaseId} startIcon={trigger.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
          {trigger.isPending ? 'Executing…' : 'Execute'}
        </Button>
      </DrawerPanel.Footer>
    </DrawerPanel>
  );
}
