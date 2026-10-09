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
import { useCreateUser } from '../../hooks/useAuth';
import { orgAccessControlUrl } from '../../paths';

export default function CreateUser(): JSX.Element {
  const { orgHandler = 'default' } = useParams();
  const navigate = useAppNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCreateUser(orgHandler);
  const backUrl = orgAccessControlUrl(orgHandler, 'users');

  const submit = () => {
    let valid = true;
    if (!username.trim()) {
      setUsernameError('Username is required');
      valid = false;
    } else {
      setUsernameError('');
    }
    if (!displayName.trim()) {
      valid = false;
    }
    if (!password.trim()) {
      setPasswordError('Password is required');
      valid = false;
    } else {
      setPasswordError('');
    }
    if (!valid) return;
    setError(null);
    mutation.mutate(
      { username: username.trim(), displayName: displayName.trim(), password },
      {
        onSuccess: () => navigate(backUrl, { state: { created: true, name: username.trim() } }),
        onError: (err) => setError(err.message ?? 'Failed to create user. Please try again.'),
      },
    );
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(backUrl)} sx={{ mb: 2 }}>
        Back to Users
      </Button>

      <Typography variant="h1" sx={{ mb: 4 }}>
        Create User
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, maxWidth: 600 }}>
          {error}
        </Alert>
      )}

      <Stack gap={3} sx={{ maxWidth: 600, mb: 4 }}>
        <TextField
          label="Username"
          required
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (usernameError) setUsernameError('');
          }}
          fullWidth
          error={!!usernameError}
          helperText={usernameError || ' '}
        />
        <TextField label="Display Name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} fullWidth helperText=" " />
        <TextField
          label="Password"
          required
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError) setPasswordError('');
          }}
          fullWidth
          error={!!passwordError}
          helperText={passwordError || ' '}
        />
      </Stack>

      <Stack direction="row" gap={2}>
        <Button variant="outlined" onClick={() => navigate(backUrl)}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!username.trim() || !displayName.trim() || !password.trim() || mutation.isPending || mutation.isSuccess}>
          Create
        </Button>
      </Stack>
    </PageContent>
  );
}
