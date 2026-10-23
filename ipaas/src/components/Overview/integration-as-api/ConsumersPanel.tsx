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

import { Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Plus, ShieldCheck, Trash2, Users } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { DELETE_CONSUMER_WARNING, SECURITY_MODE_LABEL } from '../../../constants/apiConsumption';
import { useConsumers, useDeleteConsumer, useEndpointSecurity } from '../../../hooks/useConsumers';
import type { Consumer, EndpointOption, EndpointRef } from '../../../types/consumers';
import { consumerSummary } from '../../../utils/apiConsumption';
import { friendlyApiError } from '../../../utils/apiSecurity';
import ConfirmDeleteDialog from '../../ConfirmDeleteDialog';
import ApiSecurityDrawer from './ApiSecurityDrawer';
import ConsumerDrawer from './ConsumerDrawer';
import * as styles from './apiConsumption.styles';

/** `'new'` opens the create form; a `Consumer` opens it in manage mode. */
type DialogTarget = Consumer | 'new' | null;

interface ConsumersPanelProps {
  /** Component name — the BFF's `componentName` path segment. */
  componentName: string;
  /** Project handle the consumer applications belong to. */
  projectName: string;
  /** Environment name used by the API (e.g. `development`). */
  envName: string;
  /** Display label. */
  envLabel: string;
  /** Endpoint name — the BFF's `endpointName` path segment. */
  endpointName: string;
  /** All endpoints of this environment, for the security drawer's selector. */
  endpoints: EndpointOption[];
}

/** Cloud-only "Consumers" subcard inside the API env card. */
export default function ConsumersPanel({ componentName, projectName, envName, envLabel, endpointName, endpoints }: ConsumersPanelProps): JSX.Element {
  const endpointRef: EndpointRef = useMemo(() => ({ projectName, componentName, environmentName: envName, endpointName }), [projectName, componentName, envName, endpointName]);

  const { data: consumers = [], isLoading, error } = useConsumers(projectName, endpointRef);
  const { data: security } = useEndpointSecurity(endpointRef);
  const deleteMutation = useDeleteConsumer(projectName, endpointRef);

  const [securityOpen, setSecurityOpen] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<DialogTarget>(null);
  const [pendingDelete, setPendingDelete] = useState<Consumer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const count = consumers.length;
  const existingNames = useMemo(() => consumers.map((c) => c.displayName), [consumers]);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(pendingDelete);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(friendlyApiError(err, `Could not delete “${pendingDelete.displayName}”.`));
    }
  };

  return (
    <Box sx={styles.subCard}>
      <Box sx={styles.subCardHeader}>
        <Typography variant="body2" sx={styles.subCardTitle}>
          <Users size={16} />
          Consumers
          <Typography component="span" variant="caption" color="text.secondary">
            ({count})
          </Typography>
          {security && (
            <>
              <Divider orientation="vertical" flexItem sx={styles.titleDivider} />
              <Typography component="span" variant="body2" color="text.secondary" sx={styles.securityModeGroup}>
                Security Scheme:{' '}
                <Box component="span" sx={styles.securityModeValue}>
                  {SECURITY_MODE_LABEL[security.mode]}
                </Box>
              </Typography>
            </>
          )}
        </Typography>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Button variant="text" size="small" startIcon={<ShieldCheck size={14} />} onClick={() => setSecurityOpen(true)} sx={styles.textAction}>
            Configure Security
          </Button>
          <Button variant="contained" size="small" startIcon={count > 0 ? <Plus size={14} /> : undefined} onClick={() => setDialogTarget('new')}>
            {count > 0 ? 'New Consumer' : 'Consume API'}
          </Button>
        </Stack>
      </Box>

      {isLoading ? (
        <Box sx={styles.loadingRow}>
          <CircularProgress size={20} />
        </Box>
      ) : error ? (
        <Alert severity="warning" sx={styles.panelAlert}>
          {friendlyApiError(error, 'Could not load consumer applications.')}
        </Alert>
      ) : count > 0 ? (
        <Stack gap={1} sx={styles.consumerList}>
          {consumers.map((c) => {
            // Empty for a key-only row; rendering it would leave a blank line.
            const summary = consumerSummary(c);
            return (
              <Box key={c.id} sx={styles.consumerRow}>
                <Avatar sx={styles.consumerAvatar}>{(c.displayName[0] ?? 'A').toUpperCase()}</Avatar>
                <Box sx={styles.consumerRowText}>
                  <Stack direction="row" alignItems="center" gap={0.75} sx={styles.consumerNameRow}>
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {c.displayName}
                    </Typography>
                    <Chip label={c.status === 'revoked' ? 'Revoked' : 'Active'} size="small" color={c.status === 'revoked' ? 'error' : 'success'} variant="outlined" sx={styles.consumerStatusChip} />
                  </Stack>
                  {!!summary && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={styles.consumerRowSubtitle}>
                      {summary}
                    </Typography>
                  )}
                </Box>
                <Button variant="outlined" size="small" onClick={() => setDialogTarget(c)}>
                  Manage
                </Button>
                <Tooltip title="Delete Consumer">
                  <IconButton size="small" aria-label={`Delete ${c.displayName}`} onClick={() => setPendingDelete(c)} sx={styles.consumerDeleteButton}>
                    <Trash2 size={15} />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          })}
        </Stack>
      ) : (
        <Box sx={styles.emptyState}>
          <Typography variant="caption" color="text.secondary">
            No consumer applications yet. Create your first consumer application to start calling this API.
          </Typography>
        </Box>
      )}

      <ApiSecurityDrawer open={securityOpen} onClose={() => setSecurityOpen(false)} projectName={projectName} componentName={componentName} envName={envName} endpoints={endpoints} activeEndpointName={endpointName} />
      <ConsumerDrawer open={dialogTarget !== null} onClose={() => setDialogTarget(null)} projectName={projectName} endpointRef={endpointRef} envLabel={envLabel} consumer={dialogTarget === 'new' ? null : dialogTarget} existingNames={existingNames} />

      {pendingDelete && (
        <ConfirmDeleteDialog
          title={`Delete “${pendingDelete.displayName}”?`}
          onConfirm={() => void handleDelete()}
          onClose={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          isPending={deleteMutation.isPending}
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          maxWidth="xs">
          {deleteError && (
            <Alert severity="error" sx={styles.dialogAlert}>
              {deleteError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            {DELETE_CONSUMER_WARNING}
          </Typography>
        </ConfirmDeleteDialog>
      )}
    </Box>
  );
}
