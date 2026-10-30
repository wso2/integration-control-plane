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

import { Alert, Box, Button, CircularProgress, IconButton, ListingTable, Skeleton, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { KeyRound, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useContextApiKeys, useCreateContextApiKey, useRevokeContextApiKey } from '../../../hooks/useContextEngine';
import { engineMessage } from '../../../utils/contextEngine';
import CodeViewer from '../../CodeViewer';
import ConfirmDeleteDialog from '../../ConfirmDeleteDialog';
import { mutedSx } from '../styles';
import type { ContextApiKey } from '../../../types/contextEngine';

const tableSx = { border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' } as const;

/** Keys for the engine's public API and MCP endpoint: create one (shown once), see them masked, revoke them. */
export default function ApiKeysSection({ engineId }: { engineId: string }): JSX.Element {
  const keys = useContextApiKeys(engineId);
  const create = useCreateContextApiKey(engineId);
  const revoke = useRevokeContextApiKey(engineId);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<ContextApiKey | null>(null);

  const submit = () => {
    setCreated(null);
    create.mutate(
      { ...(name.trim() ? { displayName: name.trim() } : {}) },
      {
        onSuccess: (key) => {
          setCreated(key.apiKey);
          setName('');
        },
      },
    );
  };

  const list = (): JSX.Element => {
    if (keys.isLoading) return <Skeleton variant="rounded" height={88} />;
    if (keys.isError) {
      return (
        <Alert
          severity="error"
          variant="outlined"
          action={
            <Button color="inherit" size="small" onClick={() => keys.refetch()}>
              Retry
            </Button>
          }>
          {`Couldn't load the API keys. ${engineMessage(keys.error, '')}`.trim()}
        </Alert>
      );
    }
    if (!keys.data?.length) {
      return (
        <Typography variant="body2" sx={mutedSx}>
          No API keys yet. Create one to call the API or connect an MCP client.
        </Typography>
      );
    }
    return (
      <ListingTable.Container elevation={0} sx={tableSx}>
        <ListingTable size="small">
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Name</ListingTable.Cell>
              <ListingTable.Cell>Key</ListingTable.Cell>
              <ListingTable.Cell>Status</ListingTable.Cell>
              <ListingTable.Cell align="right">Actions</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {keys.data.map((k) => (
              <ListingTable.Row key={k.name}>
                <ListingTable.Cell>{k.displayName || k.name}</ListingTable.Cell>
                <ListingTable.Cell sx={{ fontFamily: 'monospace' }}>{k.maskedKey}</ListingTable.Cell>
                <ListingTable.Cell>{k.expiresAt ? `${k.status} · expires ${new Date(k.expiresAt).toLocaleString()}` : k.status}</ListingTable.Cell>
                <ListingTable.Cell align="right">
                  <Tooltip title="Revoke">
                    <IconButton size="small" color="error" aria-label={`Revoke ${k.displayName || k.name}`} onClick={() => setToRevoke(k)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </Tooltip>
                </ListingTable.Cell>
              </ListingTable.Row>
            ))}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
    );
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        API keys
      </Typography>
      <Stack direction="row" gap={1.5} alignItems="center" sx={{ mb: 2 }}>
        <TextField size="small" label="Key name" placeholder="e.g. support-bot" value={name} onChange={(e) => setName(e.target.value)} sx={{ minWidth: 260 }} />
        <Button variant="outlined" startIcon={create.isPending ? <CircularProgress size={14} color="inherit" /> : <Plus size={16} />} disabled={create.isPending} onClick={submit}>
          Create key
        </Button>
      </Stack>
      {create.isError && (
        <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
          {`Couldn't create the key: ${engineMessage(create.error, 'please try again')}`}
        </Alert>
      )}
      {created && (
        <Alert severity="success" variant="outlined" icon={<KeyRound size={18} />} onClose={() => setCreated(null)} sx={{ mb: 2 }}>
          Copy this key now: it is not shown again.
          <Box sx={{ mt: 1 }}>
            <CodeViewer language="text" code={created} showCopyButton showLineNumbers={false} />
          </Box>
        </Alert>
      )}
      {list()}
      {toRevoke && (
        <ConfirmDeleteDialog
          title={`Revoke ${toRevoke.displayName || toRevoke.name}?`}
          confirmLabel="Revoke"
          pendingLabel="Revoking…"
          isPending={revoke.isPending}
          onClose={() => !revoke.isPending && setToRevoke(null)}
          onConfirm={() => revoke.mutate(toRevoke.name, { onSuccess: () => setToRevoke(null) })}>
          <Typography variant="body2" color="text.secondary">
            Apps and agents using this key stop getting answers at once.
          </Typography>
          {revoke.isError && (
            <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
              {`Couldn't revoke the key: ${engineMessage(revoke.error, 'please try again')}`}
            </Alert>
          )}
        </ConfirmDeleteDialog>
      )}
    </Box>
  );
}
