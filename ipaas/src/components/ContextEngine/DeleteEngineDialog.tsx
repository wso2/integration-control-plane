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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Database, KeyRound, MessageSquare, Upload } from '@wso2/oxygen-ui-icons-react';
import { useRef, useState, type JSX, type ReactNode } from 'react';
import { wrapSx } from './styles';

interface DeleteEngineDialogProps {
  name: string;
  /** Registered sources, when known, for the list of what goes. */
  sourceCount?: number;
  isPending: boolean;
  /** Why the last attempt failed, shown inside the dialog. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

function Item({ icon, children }: { icon: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <Stack direction="row" gap={1.25} alignItems="flex-start" component="li">
      <Box sx={{ color: 'text.secondary', display: 'inline-flex', mt: 0.25 }}>{icon}</Box>
      <Typography variant="body2">{children}</Typography>
    </Stack>
  );
}

/** What deleting removes when the engine deletes its own data. */
function DeletesEverything({ sourceCount }: { sourceCount?: number }): JSX.Element {
  const sources =
    sourceCount === undefined ? 'Its sources and everything indexed from them' : sourceCount === 0 ? 'Everything indexed in it' : `${sourceCount} source${sourceCount === 1 ? '' : 's'} and everything indexed from ${sourceCount === 1 ? 'it' : 'them'}`;
  return (
    <>
      <Typography variant="body2" color="text.secondary">
        This deletes the following. It can&apos;t be undone.
      </Typography>
      <Stack component="ul" gap={1} sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.75 }}>
        <Item icon={<Database size={16} />}>{sources}</Item>
        <Item icon={<Upload size={16} />}>Files uploaded to it</Item>
        <Item icon={<MessageSquare size={16} />}>Stored questions, answers and links to their passages</Item>
        <Item icon={<KeyRound size={16} />}>Its models, API keys, integrations and every access grant</Item>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.75 }}>
        Agents using its API or MCP endpoint stop working right away.
      </Typography>
    </>
  );
}

/**
 * Confirm deleting an engine: what the engine removes, and the
 * engine's name typed to confirm. The engine shows as deleting until it is gone.
 */
export default function DeleteEngineDialog({ name, sourceCount, isPending, error, onConfirm, onClose }: DeleteEngineDialogProps): JSX.Element {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === name.trim();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    // The dialog's focus trap takes focus as it opens, so autoFocus alone loses it; focus the field once the dialog is in.
    <Dialog open onClose={isPending ? undefined : onClose} maxWidth="sm" fullWidth slotProps={{ transition: { onEntered: () => inputRef.current?.focus() } }}>
      <DialogTitle>
        Are you sure you want to remove the context engine &lsquo;
        <Box component="strong" sx={wrapSx}>
          {name}
        </Box>
        &rsquo;?
      </DialogTitle>
      <DialogContent>
        <DeletesEverything sourceCount={sourceCount} />
        <DialogContentText sx={{ mt: 2, mb: 2 }}>Please type in the context engine name below to confirm.</DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          inputRef={inputRef}
          fullWidth
          label="Context engine name"
          labelPlacement="top"
          placeholder="Enter context engine name to confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches && !isPending) onConfirm();
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button variant="contained" color="error" disabled={!matches || isPending} startIcon={isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={onConfirm}>
          {isPending ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
