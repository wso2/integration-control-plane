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

import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useUpdateAllowedIps } from '../../../hooks/usePlatformServices';
import { isValidCidr } from '../../../utils/platformServices';
import SelectableChoiceCard from './SelectableChoiceCard';
import type { AllowedIpsPayload, DatabaseServerDetail, ServerVariant } from '../../../../types/platformServices';

type Mode = 'allow_all' | 'restricted';
interface CidrRow {
  cidr: string;
  description: string;
}

interface AllowedIpsDialogProps {
  serverId: string;
  variant?: ServerVariant;
  current?: DatabaseServerDetail['allowed_ips'];
  onClose: () => void;
  onResult: (type: 'success' | 'error', message: string) => void;
}

export default function AllowedIpsDialog({ serverId, variant = 'db-servers', current, onClose, onResult }: AllowedIpsDialogProps): JSX.Element {
  const [mode, setMode] = useState<Mode>(current?.mode === 'restricted' ? 'restricted' : 'allow_all');
  const [rows, setRows] = useState<CidrRow[]>(current?.allow_list?.map((ip) => ({ cidr: ip.cidr, description: ip.description ?? '' })) ?? [{ cidr: '', description: '' }]);
  const update = useUpdateAllowedIps(serverId, variant);

  const patchRow = (i: number, patch: Partial<CidrRow>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { cidr: '', description: '' }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const restrictedRows = rows.filter((r) => r.cidr.trim() !== '');
  const hasInvalidCidr = restrictedRows.some((r) => !isValidCidr(r.cidr));
  const canSave = !update.isPending && (mode === 'allow_all' || (restrictedRows.length > 0 && !hasInvalidCidr));

  const save = () => {
    if (!canSave) return;
    const payload: AllowedIpsPayload = mode === 'allow_all' ? { mode: 'allow_all' } : { mode: 'restricted', allow_list: restrictedRows.map((r) => ({ cidr: r.cidr.trim(), description: r.description.trim() || undefined })) };
    update.mutate(payload, {
      onSuccess: () => {
        onResult('success', 'Allowed IP addresses updated.');
        onClose();
      },
      onError: (e) => onResult('error', e instanceof Error ? e.message : 'Failed to update the allowed IP addresses.'),
    });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Allowed IP Addresses</DialogTitle>
      <DialogContent>
        <Stack role="radiogroup" aria-label="Access mode" direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mt: 1, mb: mode === 'restricted' ? 2 : 0 }}>
          <SelectableChoiceCard selected={mode === 'allow_all'} title="Allow All" description="Accept connections from any IP address." onSelect={() => setMode('allow_all')} />
          <SelectableChoiceCard selected={mode === 'restricted'} title="Restricted Access" description="Only accept connections from the CIDR blocks below." onSelect={() => setMode('restricted')} />
        </Stack>

        {mode === 'restricted' && (
          <Stack gap={1.5}>
            {rows.map((row, i) => (
              <Stack key={i} direction="row" gap={1} alignItems="flex-start">
                <TextField
                  size="small"
                  label="CIDR Block"
                  placeholder="e.g. 10.0.0.0/24"
                  value={row.cidr}
                  onChange={(e) => patchRow(i, { cidr: e.target.value })}
                  error={row.cidr.trim() !== '' && !isValidCidr(row.cidr)}
                  helperText={row.cidr.trim() !== '' && !isValidCidr(row.cidr) ? 'Enter a valid CIDR (e.g. 10.0.0.0/24).' : ' '}
                  sx={{ flex: '0 0 40%' }}
                />
                <TextField size="small" label="Description" placeholder="Optional" value={row.description} onChange={(e) => patchRow(i, { description: e.target.value })} fullWidth />
                <Tooltip title="Remove">
                  <span>
                    <IconButton size="small" color="error" aria-label="Remove CIDR block" onClick={() => removeRow(i)} disabled={rows.length === 1} sx={{ mt: 0.5 }}>
                      <Trash2 size={16} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            ))}
            <Typography variant="caption" color="text.secondary">
              At least one CIDR block is required for restricted access.
            </Typography>
            <Stack direction="row">
              <Button size="small" startIcon={<Plus size={16} />} onClick={addRow}>
                Add CIDR block
              </Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!canSave} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {update.isPending ? 'Updating…' : 'Update'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
