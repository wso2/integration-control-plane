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

import { Alert, Box, Button, CircularProgress, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import ConfirmDeleteDialog from '../../../components/ConfirmDeleteDialog';
import CreateCiTokenDialog from './CreateCiTokenDialog';
import { useExternalCiTokens, useRevokeExternalCiToken } from '../../hooks/useExternalCi';
import { MAX_EXTERNAL_CI_TOKENS, tokenLastUsedLabel } from '../../utils/externalCi';
import type { ExternalCiToken } from '../../../types/externalCi';

const formatCreated = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '—' : new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function CiTokensTable({ projectId, componentId, canManage }: { projectId: string; componentId: string; canManage: boolean }): JSX.Element {
  const { data: tokens = [], isLoading, isError, refetch } = useExternalCiTokens(projectId, componentId);
  const revoke = useRevokeExternalCiToken(projectId, componentId);
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ExternalCiToken | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const limitReached = tokens.length >= MAX_EXTERNAL_CI_TOKENS;

  const doRevoke = (): void => {
    if (!toDelete) return;
    const name = toDelete.name;
    revoke.mutate(toDelete.id, {
      onSuccess: () => {
        setToDelete(null);
        setAlert({ type: 'success', message: `Token '${name}' revoked.` });
      },
      onError: (e) => {
        setToDelete(null);
        setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Failed to revoke the token.' });
      },
    });
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Manage External CI Tokens
        </Typography>
        {canManage && (
          <Tooltip title={limitReached ? `You can create at most ${MAX_EXTERNAL_CI_TOKENS} tokens.` : ''}>
            <span>
              <Button variant="contained" size="small" startIcon={<Plus size={18} />} disabled={limitReached} onClick={() => setCreateOpen(true)}>
                {limitReached ? 'Maximum token limit exceeded' : 'Create'}
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load External CI tokens.
        </Alert>
      ) : (
        <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Token Name</ListingTable.Cell>
                <ListingTable.Cell>Last Used</ListingTable.Cell>
                <ListingTable.Cell>Created On</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {tokens.length === 0 ? (
                <ListingTable.Row>
                  <ListingTable.Cell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Create a token to integrate your own Build/CI pipeline with the platform.
                  </ListingTable.Cell>
                </ListingTable.Row>
              ) : (
                tokens.map((t) => (
                  <ListingTable.Row key={t.id}>
                    <ListingTable.Cell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {t.name}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary">
                        {tokenLastUsedLabel(t.last_used)}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell>
                      <Typography variant="body2" color="text.secondary">
                        {formatCreated(t.created_at)}
                      </Typography>
                    </ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      {canManage && (
                        <Tooltip title="Revoke">
                          <IconButton size="small" color="error" aria-label={`Revoke ${t.name}`} onClick={() => setToDelete(t)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ))
              )}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {createOpen && <CreateCiTokenDialog projectId={projectId} componentId={componentId} onClose={() => setCreateOpen(false)} />}

      {toDelete && (
        <ConfirmDeleteDialog
          title={
            <>
              Revoke <strong>‘{toDelete.name}’</strong>?
            </>
          }
          onConfirm={doRevoke}
          onClose={() => setToDelete(null)}
          isPending={revoke.isPending}>
          <Typography variant="body2" color="text.secondary">
            Any CI pipeline using this token will no longer be able to deploy. This action can’t be undone.
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </Box>
  );
}
