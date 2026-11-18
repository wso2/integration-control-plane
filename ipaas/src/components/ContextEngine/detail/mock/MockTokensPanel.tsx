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

import { Alert, Avatar, Box, Button, Chip, CircularProgress, DrawerPanel, IconButton, Skeleton, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Eye, EyeOff, KeyRound, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { REGENERATE_KEY_WARNING, TOKEN_MASK, TOKEN_NOT_RETRIEVABLE_NOTICE, TOKEN_ONE_TIME_WARNING } from '../../../../constants/apiConsumption';
import { Scopes } from '../../../../constants/permissions';
import { useCan } from '../../../../hooks/useCan';
import { useContextApiKeys, useCreateContextApiKey, useRevokeContextApiKey } from '../../../../hooks/useContextEngine';
import { engineMessage } from '../../../../utils/contextEngine';
import ConfirmDeleteDialog from '../../../ConfirmDeleteDialog';
import CopyButton from '../../../Overview/integration-as-api/CopyButton';
import * as styles from '../../../Overview/integration-as-api/apiConsumption.styles';
import type { ContextApiKey } from '../../../../types/contextEngine';

/** Secondary actions on the left and the primary on the right, as the Consumers drawer's footer. */
const splitFooterSx = { justifyContent: 'space-between' } as const;

/** A token as this panel shows it: an API key of the engine's public endpoint. */
interface Token {
  /** The key's name, which the backend revokes it by. */
  id: string;
  name: string;
  status: string;
  expiresAt?: string;
}

const toToken = (k: ContextApiKey): Token => ({ id: k.name, name: k.displayName || k.name, status: k.status, expiresAt: k.expiresAt });
const isActive = (t: Token): boolean => !/revoked|expired|inactive/i.test(t.status);
const statusLabel = (t: Token): string => (isActive(t) ? 'Active' : t.status.charAt(0).toUpperCase() + t.status.slice(1).toLowerCase());

/** `'new'` opens the create form; a token opens it in manage mode. */
type Target = Token | 'new' | null;

/**
 * Access tokens for this engine, laid out as the integration section's Consumers panel: a list with
 * Manage and Delete, and a drawer that creates a token and shows it once. Each token is an API key
 * of the engine's public endpoint, so one token works for both the REST API and the MCP server.
 */
export default function MockTokensPanel({ engineId }: { engineId: string }): JSX.Element {
  const can = useCan();
  const canRead = can(Scopes.INTEGRATION_READ);
  const canManage = can(Scopes.CONFIG_MANAGE);
  const keys = useContextApiKeys(engineId, canRead);
  const revoke = useRevokeContextApiKey(engineId);
  // The backend keeps revoked and expired keys in its list; they work for nothing, so the panel leaves them out.
  const tokens = (keys.data ?? []).map(toToken).filter(isActive);
  const [target, setTarget] = useState<Target>(null);
  const [pendingDelete, setPendingDelete] = useState<Token | null>(null);
  const count = tokens.length;

  const list = (): JSX.Element | null => {
    if (!canRead) return null;
    if (keys.isLoading) return <Skeleton variant="rounded" height={64} sx={styles.consumerList} />;
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
          {`Couldn't load the tokens. ${engineMessage(keys.error, '')}`.trim()}
        </Alert>
      );
    }
    if (count === 0) {
      return (
        <Box sx={styles.emptyState}>
          <Typography variant="caption" color="text.secondary">
            No tokens yet. Create one for each app or agent that calls this engine, so you can revoke one without breaking the others.
          </Typography>
        </Box>
      );
    }
    return (
      <Stack gap={1} sx={styles.consumerList}>
        {tokens.map((t) => (
          <Box key={t.id} sx={styles.consumerRow}>
            <Avatar sx={styles.consumerAvatar}>{(t.name[0] ?? 'T').toUpperCase()}</Avatar>
            <Box sx={styles.consumerRowText}>
              <Stack direction="row" alignItems="center" gap={0.75} sx={styles.consumerNameRow}>
                <Typography variant="body2" fontWeight={500} noWrap>
                  {t.name}
                </Typography>
                <Chip label={statusLabel(t)} size="small" color={isActive(t) ? 'success' : 'error'} variant="outlined" sx={styles.consumerStatusChip} />
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap sx={styles.consumerRowSubtitle}>
                {t.expiresAt ? `Expires ${new Date(t.expiresAt).toLocaleString()} · ` : ''}works for the REST API and the MCP server
              </Typography>
            </Box>
            {canManage && (
              <>
                <Button variant="outlined" size="small" onClick={() => setTarget(t)}>
                  Manage
                </Button>
                <Tooltip title="Delete token">
                  <IconButton size="small" aria-label={`Delete ${t.name}`} onClick={() => (revoke.reset(), setPendingDelete(t))} sx={styles.consumerDeleteButton}>
                    <Trash2 size={15} />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        ))}
      </Stack>
    );
  };

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
        {canManage && (
          <Button variant="contained" size="small" startIcon={count > 0 ? <Plus size={14} /> : undefined} onClick={() => setTarget('new')}>
            {count > 0 ? 'New token' : 'Create token'}
          </Button>
        )}
      </Box>

      {list()}

      <TokenDrawer engineId={engineId} target={target} tokens={tokens} onClose={() => setTarget(null)} />

      {pendingDelete && (
        <ConfirmDeleteDialog
          title={`Delete “${pendingDelete.name}”?`}
          isPending={revoke.isPending}
          pendingLabel="Deleting…"
          onConfirm={() => revoke.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })}
          onClose={() => !revoke.isPending && setPendingDelete(null)}
          maxWidth="xs">
          <Typography variant="body2" color="text.secondary">
            Apps and agents using this token stop working at once.
          </Typography>
          {revoke.isError && (
            <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
              {`Couldn't delete the token: ${engineMessage(revoke.error, 'please try again')}`}
            </Alert>
          )}
        </ConfirmDeleteDialog>
      )}
    </Box>
  );
}

function TokenDrawer({ engineId, target, tokens, onClose }: { engineId: string; target: Target; tokens: Token[]; onClose: () => void }): JSX.Element {
  const create = useCreateContextApiKey(engineId);
  const revoke = useRevokeContextApiKey(engineId);
  const [name, setName] = useState('');
  /** The token just created or regenerated, with its plaintext; held only while the drawer is open. */
  const [issued, setIssued] = useState<{ token: Token; secret: string } | null>(null);
  const [reveal, setReveal] = useState(false);
  const [confirm, setConfirm] = useState<'regenerate' | 'revoke' | null>(null);
  const open = target !== null;
  const managed = target && target !== 'new' ? target : null;
  // The listing may not have the new key yet, so the issued token stands in until it does.
  const token = issued ? (tokens.find((t) => t.id === issued.token.id) ?? issued.token) : managed ? (tokens.find((t) => t.id === managed.id) ?? managed) : undefined;
  const secret = issued && token?.id === issued.token.id ? issued.secret : null;
  const taken = tokens.some((t) => t.name.toLowerCase() === name.trim().toLowerCase());
  const busy = create.isPending || revoke.isPending;
  const error = create.error ?? revoke.error;

  useEffect(() => {
    if (!open) return;
    setName('');
    setIssued(null);
    setReveal(false);
    setConfirm(null);
    create.reset();
    revoke.reset();
    // Reset only when the drawer opens on a new target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  // The plaintext is shown once: closing the drawer forgets it.
  const close = () => {
    if (busy) return;
    setIssued(null);
    onClose();
  };

  const issue = (displayName: string, onIssued?: (token: Token) => void) =>
    create.mutate(
      { displayName },
      {
        onSuccess: (k) => {
          const t: Token = { id: k.keyId, name: displayName, status: 'active', expiresAt: k.expiresAt };
          setIssued({ token: t, secret: k.apiKey });
          setReveal(false);
          onIssued?.(t);
        },
      },
    );

  // There is no rotate route: a regenerated token is a new key under the same name, and the old one is revoked.
  const regenerate = (old: Token) => issue(old.name, () => revoke.mutate(old.id, { onSuccess: () => setConfirm(null) }));
  const revokeToken = (t: Token) => revoke.mutate(t.id, { onSuccess: () => (setConfirm(null), onClose()) });

  return (
    <DrawerPanel open={open} onClose={close}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>{token ? token.name : 'New access token'}</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        {error && (
          <Alert severity="error" variant="outlined" sx={styles.dialogAlert}>
            {`Couldn't ${create.error ? 'create' : 'revoke'} the token: ${engineMessage(error, 'please try again')}`}
          </Alert>
        )}
        <TextField
          label="Token name"
          labelPlacement="top"
          required={!token}
          value={token ? token.name : name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. support-bot"
          size="small"
          fullWidth
          autoFocus={!token}
          disabled={!!token || busy}
          error={!token && taken}
          helperText={!token && taken ? 'A token with this name already exists.' : 'Name it after the app or agent that will use it.'}
          sx={token ? styles.lockedField : undefined}
        />

        {token && (
          <Box sx={styles.credentialsSection}>
            {secret && (
              <Alert severity="warning" sx={styles.dialogAlert}>
                {TOKEN_ONE_TIME_WARNING}
              </Alert>
            )}
            <Typography sx={styles.fieldLabel}>Header</Typography>
            <Box sx={styles.credField}>
              <Typography component="span" sx={styles.credValue}>
                X-API-Key
              </Typography>
              <CopyButton value="X-API-Key" label="Copy header name" />
            </Box>
            <Typography sx={styles.nextFieldLabel}>Value</Typography>
            {secret ? (
              <Box sx={styles.credField}>
                <Typography component="span" sx={styles.credValue}>
                  {reveal ? secret : TOKEN_MASK}
                </Typography>
                <Tooltip title={reveal ? 'Hide' : 'Reveal'}>
                  <IconButton size="small" aria-label={reveal ? 'Hide token' : 'Reveal token'} onClick={() => setReveal((v) => !v)} sx={styles.credIconButton}>
                    {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
                  </IconButton>
                </Tooltip>
                <CopyButton value={secret} label="Copy header value" />
              </Box>
            ) : (
              <Alert severity="info">{isActive(token) ? TOKEN_NOT_RETRIEVABLE_NOTICE : 'This token is no longer active. Regenerate it to use it again.'}</Alert>
            )}
          </Box>
        )}

        {/* Confirmed in the drawer itself: a dialog over a drawer would stack two modal layers. */}
        {confirm && token && <Alert severity="warning">{confirm === 'regenerate' ? REGENERATE_KEY_WARNING : 'The token is revoked immediately, and apps and agents using it stop working at once.'}</Alert>}
      </DrawerPanel.Body>

      <DrawerPanel.Footer sx={token && !confirm ? splitFooterSx : undefined}>
        {confirm && token ? (
          <>
            <Button variant="outlined" color="inherit" disabled={busy} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="contained" color="error" disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} onClick={() => (confirm === 'regenerate' ? regenerate(token) : revokeToken(token))}>
              {confirm === 'regenerate' ? 'Regenerate token' : 'Revoke token'}
            </Button>
          </>
        ) : token ? (
          <>
            <Button variant="outlined" color="error" onClick={() => setConfirm('revoke')} disabled={!isActive(token) || busy}>
              Revoke
            </Button>
            <Stack direction="row" gap={1}>
              <Button variant="outlined" disabled={busy} onClick={() => setConfirm('regenerate')}>
                Regenerate
              </Button>
              <Button variant="contained" disabled={busy} onClick={close}>
                Done
              </Button>
            </Stack>
          </>
        ) : (
          <>
            <Button variant="outlined" color="inherit" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button variant="contained" disabled={!name.trim() || taken || busy} startIcon={create.isPending ? <CircularProgress size={14} color="inherit" /> : undefined} onClick={() => issue(name.trim())}>
              Create token
            </Button>
          </>
        )}
      </DrawerPanel.Footer>
    </DrawerPanel>
  );
}
