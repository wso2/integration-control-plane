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

import { Autocomplete, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useState, type JSX } from 'react';
import { useUpdateRoleGroupMapping } from '../../../hooks/useAppSecurity';

interface MapGroupsDialogProps {
  roleId: string;
  roleName: string;
  currentGroups: string[];
  onClose: () => void;
  onSaved: (roleName: string) => void;
  onError: (message: string) => void;
}

/** Map external (IdP) group names to a role. Group names are free-form. */
export default function MapGroupsDialog({ roleId, roleName, currentGroups, onClose, onSaved, onError }: MapGroupsDialogProps): JSX.Element {
  const update = useUpdateRoleGroupMapping();
  const [groups, setGroups] = useState<string[]>(currentGroups);

  const handleSave = () =>
    update.mutate(
      { roleId, groups },
      {
        onSuccess: () => {
          onClose();
          onSaved(roleName);
        },
        onError: (e) => {
          onClose();
          onError(e.message || 'Failed to update group mappings.');
        },
      },
    );

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Map groups to &lsquo;{roleName}&rsquo;</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>Members of these identity-provider groups are granted this role.</DialogContentText>
        <Autocomplete multiple freeSolo options={[]} value={groups} onChange={(_, v) => setGroups(v as string[])} renderInput={(params) => <TextField {...params} label="Groups" placeholder="Type a group name and press Enter" />} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={update.isPending} startIcon={update.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
