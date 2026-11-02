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

import { Box, Button, Chip, CircularProgress, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import ConfigEditor, { type EditorContext } from '../../../Configs/ConfigEditor';
import { useConfigMaps, useContainerConfigMounts, useDeleteConfig, useSecrets } from '../../../../hooks/useDevopsConfigs';
import { buildConfigRows } from '../../../../utils/devopsConfigs';
import type { ConfigKind, ConfigRow } from '../../../../types/devopsConfigs';

interface ConfigStepProps {
  ctx: EditorContext;
  /** Which configs this step manages — env-var sets or file mounts. */
  kind: ConfigKind;
  emptyText: string;
  onNotify: (message: string, severity: 'success' | 'error') => void;
}

type View = { mode: 'list' } | { mode: 'create' } | { mode: 'edit'; row: ConfigRow };

/**
 * A Configure-drawer step that lists the component's configs of one kind
 * (environment variables or file mounts) and lets the user add/edit/remove them.
 * Reuses the shared `ConfigEditor` + devops config hooks — the same surface as
 * the Configs & Secrets page, scoped to a single kind and embedded in the drawer.
 */
export default function ConfigStep({ ctx, kind, emptyText, onNotify }: ConfigStepProps): JSX.Element {
  const { data: mounts = [], isLoading } = useContainerConfigMounts(ctx.projectId, ctx.componentId, ctx.releaseId, ctx.containerId, ctx.deploymentTrackId);
  const { data: configMaps = [] } = useConfigMaps(ctx.projectId, ctx.envId, ctx.deploymentTrackId);
  const { data: secrets = [] } = useSecrets(ctx.projectId, ctx.envId, ctx.deploymentTrackId);
  const rows = useMemo(() => buildConfigRows(mounts, configMaps, secrets).filter((r) => r.kind === kind), [mounts, configMaps, secrets, kind]);

  const del = useDeleteConfig(ctx.projectId, ctx.deploymentTrackId);
  const [view, setView] = useState<View>({ mode: 'list' });

  const remove = (row: ConfigRow) => {
    del.mutate(
      { componentId: ctx.componentId, releaseId: ctx.releaseId, containerId: ctx.containerId, mountId: row.mount.ID },
      {
        onSuccess: () => onNotify(`'${row.name}' removed.`, 'success'),
        onError: (e) => onNotify(e instanceof Error ? e.message : 'Failed to remove.', 'error'),
      },
    );
  };

  if (view.mode !== 'list') {
    return (
      <ConfigEditor
        ctx={ctx}
        existing={view.mode === 'edit' ? view.row : undefined}
        onBack={() => setView({ mode: 'list' })}
        onSaved={(message) => {
          setView({ mode: 'list' });
          onNotify(message, 'success');
        }}
        onError={(message) => onNotify(message, 'error')}
      />
    );
  }

  return (
    <Stack gap={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button size="small" variant="contained" startIcon={<Plus size={16} />} onClick={() => setView({ mode: 'create' })}>
          Add
        </Button>
      </Stack>

      {isLoading ? (
        <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', my: 3 }} />
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {emptyText}
          </Typography>
        </Box>
      ) : (
        <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>{kind === 'fileMount' ? 'Mount Path' : 'Keys'}</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {rows.map((r) => (
                <ListingTable.Row key={r.mount.ID}>
                  <ListingTable.Cell>
                    <Stack direction="row" alignItems="center" gap={1}>
                      {r.name}
                      {r.isSecret && <Chip label="Secret" size="small" variant="outlined" color="warning" />}
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell>{r.kind === 'fileMount' ? r.mount.mount_path || '—' : r.keys.join(', ') || '—'}</ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" aria-label={`Edit ${r.name}`} onClick={() => setView({ mode: 'edit', row: r })}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton size="small" color="error" aria-label={`Remove ${r.name}`} disabled={del.isPending} onClick={() => remove(r)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}
    </Stack>
  );
}
