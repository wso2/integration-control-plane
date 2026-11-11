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

import { Alert, Avatar, Box, Button, Chip, Drawer, IconButton, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Eye, EyeOff, KeyRound, Plus, Trash2, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { REGENERATE_KEY_WARNING, REVOKE_KEY_WARNING, TOKEN_MASK, TOKEN_NOT_RETRIEVABLE_NOTICE, TOKEN_ONE_TIME_WARNING } from '../../../../constants/apiConsumption';
import ConfirmDeleteDialog from '../../../ConfirmDeleteDialog';
import CopyButton from '../../../Overview/integration-as-api/CopyButton';
import * as styles from './mockTokensPanel.styles';
import { createMockToken, deleteMockToken, forgetMockSecret, regenerateMockToken, revokeMockToken, useMockTokens, type MockToken } from './mockTokens';

/** `'new'` opens the create form; a token opens it in manage mode. */
type Target = MockToken | 'new' | null;

/**
 * MOCK. Access tokens for this engine, laid out as the integration section's Consumers panel: a
 * list with Manage and Delete, and a drawer that creates a token and shows it once. One token
 * works for both the REST API and the MCP server.
 */
export default function MockTokensPanel({ engineId }: { engineId: string }): JSX.Element {
  const tokens = useMockTokens(engineId);
  const [target, setTarget] = useState<Target>(null);
  const [pendingDelete, setPendingDelete] = useState<MockToken | null>(null);
  const count = tokens.length;

  return (
    <Box sx={styles.subCard}>
      <Box sx={styles.subCardHeader}>
        <Typography variant="body2" sx={styles.subCardTitle}>
          <KeyRound size={16} />
          Access tokens
          <Typography component="span" variant="caption" color="text.secondary">
            ({count})
          </Typography>
        </Typography>
        <Button variant="contained" size="small" startIcon={count > 0 ? <Plus size={14} /> : undefined} onClick={() => setTarget('new')}>
          {count > 0 ? 'New token' : 'Create token'}
        </Button>
      </Box>

      {count > 0 ? (
        <Stack gap={1} sx={styles.consumerList}>
          {tokens.map((t) => (
            <Box key={t.id} sx={styles.consumerRow}>
              <Avatar sx={styles.consumerAvatar}>{(t.name[0] ?? 'T').toUpperCase()}</Avatar>
              <Box sx={styles.consumerRowText}>
                <Stack direction="row" alignItems="center" gap={0.75} sx={styles.consumerNameRow}>
                  <Typography variant="body2" fontWeight={500} noWrap>
                    {t.name}
                  </Typography>
                  <Chip label={t.status === 'revoked' ? 'Revoked' : 'Active'} size="small" color={t.status === 'revoked' ? 'error' : 'success'} variant="outlined" sx={styles.consumerStatusChip} />
                </Stack>
                <Typography variant="caption" color="text.secondary" noWrap sx={styles.consumerRowSubtitle}>
                  Created {new Date(t.createdAt).toLocaleString()} · works for the REST API and the MCP server
                </Typography>
              </Box>
              <Button variant="outlined" size="small" onClick={() => setTarget(t)}>
                Manage
              </Button>
              <Tooltip title="Delete token">
                <IconButton size="small" aria-label={`Delete ${t.name}`} onClick={() => setPendingDelete(t)} sx={styles.consumerDeleteButton}>
                  <Trash2 size={15} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      ) : (
        <Box sx={styles.emptyState}>
          <Typography variant="caption" color="text.secondary">
            No tokens yet. Create one for each app or agent that calls this engine, so you can revoke one without breaking the others.
          </Typography>
        </Box>
      )}

      <MockTokenDrawer engineId={engineId} target={target} tokens={tokens} onClose={() => setTarget(null)} />

      {pendingDelete && (
        <ConfirmDeleteDialog title={`Delete “${pendingDelete.name}”?`} onConfirm={() => (deleteMockToken(engineId, pendingDelete.id), setPendingDelete(null))} onClose={() => setPendingDelete(null)} isPending={false} maxWidth="xs">
          <Typography variant="body2" color="text.secondary">
            Apps and agents using this token stop working at once.
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </Box>
  );
}

function MockTokenDrawer({ engineId, target, tokens, onClose }: { engineId: string; target: Target; tokens: MockToken[]; onClose: () => void }): JSX.Element {
  const [name, setName] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [confirm, setConfirm] = useState<'regenerate' | 'revoke' | null>(null);
  const open = target !== null;
  const id = createdId ?? (target && target !== 'new' ? target.id : null);
  const token = id ? tokens.find((t) => t.id === id) : undefined;
  const taken = tokens.some((t) => t.name.toLowerCase() === name.trim().toLowerCase());

  useEffect(() => {
    if (!open) return;
    setName('');
    setCreatedId(null);
    setReveal(false);
    setConfirm(null);
  }, [open, target]);

  const close = () => {
    // The plaintext is shown once; closing the drawer forgets it.
    if (token?.secret) forgetMockSecret(engineId, token.id);
    onClose();
  };
  const header = token?.secret ? `Bearer ${token.secret}` : '';

  return (
    <Drawer anchor="right" open={open} onClose={close} variant="temporary" sx={styles.rightDrawer}>
      <Box sx={styles.drawerFrame}>
        <Box sx={styles.drawerHeader}>
          <Typography variant="subtitle1" fontWeight={600}>
            {token ? token.name : 'New access token'}
          </Typography>
          <IconButton size="small" onClick={close} aria-label="Close">
            <X size={16} />
          </IconButton>
        </Box>

        <Box sx={styles.drawerBody}>
          <Alert severity="warning" sx={styles.dialogAlert}>
            Mock: this token is not real. The engine does not accept it.
          </Alert>
          <Typography sx={styles.fieldLabel}>
            <span>
              Token name
              {!token && (
                <Box component="span" sx={styles.requiredMark} aria-hidden="true">
                  *
                </Box>
              )}
            </span>
          </Typography>
          <TextField
            value={token ? token.name : name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. support-bot"
            size="small"
            fullWidth
            autoFocus={!token}
            disabled={!!token}
            error={!token && taken}
            helperText={!token && taken ? 'A token with this name already exists.' : 'Name it after the app or agent that will use it.'}
            sx={token ? styles.lockedField : undefined}
          />

          {token && (
            <Box sx={styles.credentialsSection}>
              {token.secret && (
                <Alert severity="warning" sx={styles.dialogAlert}>
                  {TOKEN_ONE_TIME_WARNING}
                </Alert>
              )}
              <Typography sx={styles.fieldLabel}>Header</Typography>
              <Box sx={styles.credField}>
                <Typography component="span" sx={styles.credValue}>
                  Authorization
                </Typography>
                <CopyButton value="Authorization" label="Copy header name" />
              </Box>
              <Typography sx={styles.nextFieldLabel}>Value</Typography>
              {token.secret ? (
                <Box sx={styles.credField}>
                  <Typography component="span" sx={styles.credValue}>
                    {reveal ? header : `Bearer ${TOKEN_MASK}`}
                  </Typography>
                  <Tooltip title={reveal ? 'Hide' : 'Reveal'}>
                    <IconButton size="small" onClick={() => setReveal((v) => !v)} sx={styles.credIconButton}>
                      {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                    </IconButton>
                  </Tooltip>
                  <CopyButton value={header} label="Copy header value" />
                </Box>
              ) : (
                <Alert severity="info">{token.status === 'revoked' ? 'This token is revoked. Regenerate it to use it again.' : TOKEN_NOT_RETRIEVABLE_NOTICE}</Alert>
              )}
            </Box>
          )}
        </Box>

        <Box sx={token ? styles.drawerFooterSplit : styles.drawerFooter}>
          {token ? (
            <>
              <Button variant="outlined" color="error" onClick={() => setConfirm('revoke')} disabled={token.status === 'revoked'}>
                Revoke
              </Button>
              <Stack direction="row" gap={1}>
                <Button variant="outlined" onClick={() => setConfirm('regenerate')}>
                  Regenerate
                </Button>
                <Button variant="contained" onClick={close}>
                  Done
                </Button>
              </Stack>
            </>
          ) : (
            <>
              <Button variant="outlined" onClick={close}>
                Cancel
              </Button>
              <Button variant="contained" disabled={!name.trim() || taken} onClick={() => setCreatedId(createMockToken(engineId, name).id)}>
                Create token
              </Button>
            </>
          )}
        </Box>
      </Box>

      {confirm && token && (
        <ConfirmDeleteDialog
          title={confirm === 'regenerate' ? 'Regenerate this token?' : 'Revoke this token?'}
          onConfirm={() => {
            if (confirm === 'regenerate') {
              regenerateMockToken(engineId, token.id);
              setReveal(false);
            } else revokeMockToken(engineId, token.id);
            setConfirm(null);
          }}
          onClose={() => setConfirm(null)}
          isPending={false}
          confirmLabel={confirm === 'regenerate' ? 'Regenerate' : 'Revoke'}
          maxWidth="xs">
          <Typography variant="body2" color="text.secondary">
            {confirm === 'regenerate' ? REGENERATE_KEY_WARNING : REVOKE_KEY_WARNING}
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </Drawer>
  );
}
