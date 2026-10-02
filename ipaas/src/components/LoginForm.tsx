// This component is unused and should be removed.

/**
 * Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com).
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

import { useState, useEffect } from 'react';
import type { JSX } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControlLabel, IconButton, InputAdornment, InputLabel, Link, OutlinedInput, Typography } from '@wso2/oxygen-ui';
import { Eye, EyeOff, GitHub, Google } from '@wso2/oxygen-ui-icons-react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { resourceUrl } from '../nav';
import { useAuth } from '#auth';

function friendlyLoginError(err: unknown, isSso = false): string {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as Record<string, unknown>)?.status as number | undefined;

  if (status === 401 || message.includes('invalid credentials') || message.includes('unauthorized')) return 'Incorrect username or password. Please try again.';
  if (status === 429 || message.includes('too many') || message.includes('rate limit')) return 'Account temporarily locked due to too many failed attempts.';
  if (status === 403 || message.includes('locked') || message.includes('disabled') || message.includes('forbidden')) return 'Your account has been locked or disabled. Please contact your administrator.';
  if (status === 404 || message.includes('not found')) return 'Account not found. Please check your username and try again.';
  if (message.includes('failed to fetch') || message.includes('networkerror') || err instanceof TypeError) return 'Unable to connect to the server. Please check your connection and try again.';
  if ((status && status >= 500) || message.includes('internal') || message.includes('server error')) return 'Something went wrong on our end. Please try again later.';
  if (isSso) return 'Single sign-on is currently unavailable. Please try again later or use username and password.';
  return 'Sign-in failed. Please try again or contact your administrator.';
}

export default function LoginForm(): JSX.Element {
  const navigate = useAppNavigate();
  const { login, loginWithOIDC } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  const isLockedOut = lockoutSeconds > 0;
  useEffect(() => {
    if (!isLockedOut) return;
    const id = setInterval(() => setLockoutSeconds((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [isLockedOut]);

  const handleClickShowPassword = () => setShowPassword((show) => !show);

  const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const handleMouseUpPassword = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const [ssoProvider, setSsoProvider] = useState<string | null>(null);

  const handleSSOLogin = async (fidp: string) => {
    setError(null);
    setSsoLoading(true);
    setSsoProvider(fidp);
    try {
      await loginWithOIDC(fidp);
    } catch (err) {
      setError(friendlyLoginError(err, true));
      setSsoLoading(false);
      setSsoProvider(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate(resourceUrl({ level: 'organizations', org: 'default' }, 'overview'));
    } catch (err) {
      setError(friendlyLoginError(err));
      const retry = (err as { retryAfterSeconds?: number }).retryAfterSeconds;
      if (retry && retry > 0) setLockoutSeconds(retry);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <Box sx={{ mb: 6 }}>
        <Typography variant="h1" gutterBottom>
          Sign In
        </Typography>

        <Typography>
          Don&apos;t have an account? <Link href="/signup">Sign Up</Link>
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ my: 2 }}>
          {isLockedOut ? `${error} Try again in ${lockoutSeconds}s.` : error}
        </Alert>
      )}

      <Box>
        <Button
          fullWidth
          variant="contained"
          startIcon={ssoLoading && ssoProvider === 'google' ? <CircularProgress size={20} color="inherit" /> : <Google />}
          color="secondary"
          sx={{ my: 1 }}
          onClick={() => handleSSOLogin('google')}
          disabled={loading || ssoLoading}>
          {ssoLoading && ssoProvider === 'google' ? 'Redirecting...' : 'Continue with Google'}
        </Button>
        <Button
          fullWidth
          variant="contained"
          startIcon={ssoLoading && ssoProvider === 'github' ? <CircularProgress size={20} color="inherit" /> : <GitHub />}
          color="secondary"
          sx={{ my: 1 }}
          onClick={() => handleSSOLogin('github')}
          disabled={loading || ssoLoading}>
          {ssoLoading && ssoProvider === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
        </Button>
      </Box>

      <Divider sx={{ my: 3 }}>or</Divider>

      <Box display="flex" flexDirection="column" gap={2}>
        <Box display="flex" flexDirection="column" gap={0.5}>
          <InputLabel htmlFor="username">Username</InputLabel>
          <OutlinedInput type="text" id="username" name="username" placeholder="Enter your username" value={username} onChange={(e) => setUsername(e.target.value)} size="small" required disabled={loading} />
        </Box>
        <Box display="flex" flexDirection="column" gap={0.5}>
          <InputLabel htmlFor="password">Password</InputLabel>
          <OutlinedInput
            type={showPassword ? 'text' : 'password'}
            endAdornment={
              <InputAdornment position="end">
                <IconButton aria-label={showPassword ? 'hide the password' : 'display the password'} onClick={handleClickShowPassword} onMouseDown={handleMouseDownPassword} onMouseUp={handleMouseUpPassword} edge="end">
                  {showPassword ? <EyeOff /> : <Eye />}
                </IconButton>
              </InputAdornment>
            }
            id="password"
            name="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            size="small"
            required
            disabled={loading}
          />
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
          <FormControlLabel control={<Checkbox name="remember-me-checkbox" />} label="Remember me" />
          <Link href="">Forgot your password?</Link>
        </Box>

        <input type="hidden" id="sessionDataKey" name="sessionDataKey" value="" />
        <Button variant="contained" color="primary" type="submit" fullWidth sx={{ mt: 2 }} disabled={loading || isLockedOut} startIcon={loading ? <CircularProgress size={20} color="inherit" /> : undefined}>
          {isLockedOut ? `Locked (${lockoutSeconds}s)` : loading ? 'Signing In...' : 'Sign In'}
        </Button>
      </Box>
    </form>
  );
}
