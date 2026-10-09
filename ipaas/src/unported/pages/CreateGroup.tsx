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

import { Alert, Button, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useCreateGroup } from '../../hooks/useAuth';
import { orgAccessControlUrl } from '../../paths';

export default function CreateGroup(): JSX.Element {
  const { orgHandler = 'default' } = useParams();
  const navigate = useAppNavigate();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateGroup(orgHandler);
  const backUrl = orgAccessControlUrl(orgHandler, 'groups');

  const submit = () => {
    setError(null);
    mutation.mutate(
      { groupName: groupName.trim(), description: description.trim() },
      {
        onSuccess: () => navigate(backUrl, { state: { created: true, name: groupName.trim() } }),
        onError: (err) => setError(err.message ?? 'Failed to create group. Please try again.'),
      },
    );
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(backUrl)} sx={{ mb: 2 }}>
        Back to Groups
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Create Group
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, maxWidth: 600 }}>
          {error}
        </Alert>
      )}

      <Stack gap={3} sx={{ maxWidth: 600, mb: 4 }}>
        <TextField label="Name" required value={groupName} onChange={(e) => setGroupName(e.target.value)} fullWidth />
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
      </Stack>

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(backUrl)}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!groupName.trim() || mutation.isPending || mutation.isSuccess}>
          Create
        </Button>
      </Stack>
    </PageContent>
  );
}
