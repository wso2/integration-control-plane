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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Check, Copy } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useCreateExternalCiToken } from '../../hooks/useExternalCi';

interface CreateCiTokenDialogProps {
  projectId: string;
  componentId: string;
  onClose: () => void;
}

const requiredSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } };

/** Create an External CI token, then reveal the raw token once for the user to copy. */
export default function CreateCiTokenDialog({ projectId, componentId, onClose }: CreateCiTokenDialogProps): JSX.Element {
  const create = useCreateExternalCiToken(projectId, componentId);
  const [name, setName] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onCreate = (): void => {
    if (!name.trim()) return;
    setError(null);
    create.mutate(name.trim(), {
      onSuccess: (raw) => setToken(raw),
      onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create the token.'),
    });
  };

  const copy = async (): Promise<void> => {
    if (!token || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard write failed — ignore */
    }
  };

  return (
    <Dialog
      open
      onClose={() => {
        // Don't allow backdrop/Escape dismissal while the create request is in flight.
        if (!create.isPending) onClose();
      }}
      maxWidth="sm"
      fullWidth>
      <DialogTitle>{token ? 'Token created' : 'Create External CI Token'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {token ? (
          <Stack gap={1.5}>
            <Alert severity="warning">Copy this token now — it won&apos;t be shown again.</Alert>
            <Stack direction="row" alignItems="center" gap={1} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>
                {token}
              </Typography>
              <Tooltip title={copied ? 'Copied' : 'Copy'}>
                <IconButton size="small" aria-label="Copy token" onClick={copy}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        ) : (
          <Box sx={{ pt: 1 }}>
            <TextField
              label="Token Name"
              required
              fullWidth
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. github-actions"
              sx={requiredSx}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCreate();
                }
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {token ? (
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="outlined" onClick={onClose} disabled={create.isPending}>
              Cancel
            </Button>
            <Button variant="contained" onClick={onCreate} disabled={!name.trim() || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Create
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
