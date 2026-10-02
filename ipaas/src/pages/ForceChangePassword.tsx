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

import { useState } from 'react';
import type { JSX } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, IconButton, InputAdornment, InputLabel, OutlinedInput, Stack, Typography } from '@wso2/oxygen-ui';
import { Eye, EyeOff } from '@wso2/oxygen-ui-icons-react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useAuth } from '#auth';
import { useForceChangePassword } from '../hooks/useAuth';
import { resourceUrl } from '../nav';

export default function ForceChangePassword(): JSX.Element {
  const navigate = useAppNavigate();
  const { clearRequirePasswordChange } = useAuth();
  const mutation = useForceChangePassword();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = newPassword.trim().length > 0 && newPassword === confirmPassword && !mutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(
      { newPassword },
      {
        onSuccess: () => {
          clearRequirePasswordChange();
          navigate(resourceUrl({ level: 'organizations', org: 'default' }, 'overview'));
        },
      },
    );
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', p: 2 }}>
      <Card variant="outlined" sx={{ maxWidth: 440, width: '100%' }}>
        <CardContent>
          <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
            Change Your Password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Your password has been reset by an administrator. You must set a new password before continuing.
          </Typography>

          {mutation.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to change password.'}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <Box>
                <InputLabel>New Password</InputLabel>
                <OutlinedInput
                  fullWidth
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                  endAdornment={
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowNew((s) => !s)} onMouseDown={(e) => e.preventDefault()} edge="end" size="small">
                        {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                      </IconButton>
                    </InputAdornment>
                  }
                />
              </Box>

              <Box>
                <InputLabel>Confirm New Password</InputLabel>
                <OutlinedInput fullWidth type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} error={passwordMismatch} />
                {passwordMismatch && (
                  <Typography variant="caption" color="error">
                    Passwords do not match.
                  </Typography>
                )}
              </Box>

              <Divider />

              <Button type="submit" variant="contained" fullWidth disabled={!canSubmit}>
                {mutation.isPending ? <CircularProgress size={20} color="inherit" /> : 'Set New Password'}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
