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

import { Alert, Autocomplete, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useState, type JSX } from 'react';
import { useGroups, useInviteUsers } from '../../../../hooks/useAuth';
import type { Group } from '../../../../types/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteUsersDialog({ orgHandler, onClose, onInvited }: { orgHandler: string; onClose: () => void; onInvited: (count: number) => void }): JSX.Element {
  const { data: groups = [] } = useGroups(orgHandler);
  const invite = useInviteUsers(orgHandler);
  const [emails, setEmails] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Group[]>([]);
  const [error, setError] = useState('');

  const invalidEmails = emails.filter((e) => !EMAIL_RE.test(e));
  const canInvite = emails.length > 0 && invalidEmails.length === 0 && !invite.isPending;

  const handleInvite = () => {
    setError('');
    invite.mutate(
      { emails, groups: selectedGroups.map((g) => g.groupId) },
      {
        onSuccess: () => {
          onClose();
          onInvited(emails.length);
        },
        onError: (e) => setError(e.message || 'Failed to invite users.'),
      },
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Invite Users</DialogTitle>
      <DialogContent>
        <Stack gap={2.5} sx={{ mt: 1 }}>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          <Autocomplete
            multiple
            freeSolo
            options={[]}
            value={emails}
            onChange={(_, v) => setEmails((v as string[]).map((s) => s.trim()).filter(Boolean))}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Emails"
                placeholder="Type an email and press Enter"
                error={invalidEmails.length > 0}
                helperText={invalidEmails.length > 0 ? `Invalid email(s): ${invalidEmails.join(', ')}` : 'Press Enter to add each email address.'}
              />
            )}
          />
          <Autocomplete
            multiple
            options={groups}
            value={selectedGroups}
            onChange={(_, v) => setSelectedGroups(v)}
            getOptionLabel={(g) => g.groupName}
            isOptionEqualToValue={(a, b) => a.groupId === b.groupId}
            renderInput={(params) => <TextField {...params} label="Groups (optional)" placeholder="Assign groups" />}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={invite.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleInvite} disabled={!canInvite} startIcon={invite.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {invite.isPending ? 'Inviting…' : 'Invite'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
