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

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Alert, Box, Button, CircularProgress, ColorSchemeImage, Divider, Grid, Link, Stack, Typography } from '@wso2/oxygen-ui';
import PageLoader from '../components/PageLoader';
import { GitHub, Google, Mail } from '@wso2/oxygen-ui-icons-react';
import { Link as NavLink } from 'react-router';
import { useAuth } from '#auth';
import { useBfcacheReset } from '../hooks/useBfcacheReset';
import { loginUrl, privacyPolicyUrl } from '../paths';
import AuthMarketingPanel from '../components/AuthMarketingPanel';
import RegionSelector from '../components/RegionSelector';
import { IS_CLOUD } from '../features';

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function friendlyError(err: unknown): string {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (message.includes('failed to fetch') || err instanceof TypeError) return 'Unable to connect to the server. Please check your connection and try again.';
  return 'Sign-up failed. Please try again.';
}

export default function Signup(): JSX.Element {
  const base = import.meta.env.BASE_URL;
  const { loginWithOIDC } = useAuth();

  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cloud variant: sign-up is handled on Thunder's hosted branded split-screen page.
  // Hand off immediately to Thunder's authorize endpoint (no fidp) instead of
  // rendering our own marketing + provider page.
  useEffect(() => {
    if (IS_CLOUD) {
      setLoading(true);
      loginWithOIDC().catch((err) => {
        setLoading(false);
        setError(friendlyError(err));
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useBfcacheReset(setLoading, setProvider);

  const handleEmailSignup = () => {
    setLoading(true);
    setProvider('LOCAL');
    const origin = window.location.origin;
    const postRegisterCallback = `${origin}/login?method=basic&returnToUrl=%2F`;
    const params = new URLSearchParams({
      'initiated-platform': 'devant',
      'template-name': 'DevantLiteUserEmailConfirmation',
      'tenant-url-prefix': origin,
      'post-register-callback': postRegisterCallback,
      portalVal: origin,
    });
    window.location.href = `${window.API_CONFIG.asgardeoSignupUrl}?${params}`;
  };

  const handleSignup = async (fidp: string) => {
    setError(null);
    setLoading(true);
    setProvider(fidp);
    try {
      await loginWithOIDC(fidp);
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
      setProvider(null);
    }
  };

  // Cloud variant renders no in-app sign-up UI — just a spinner while redirecting
  // to Thunder's hosted branded split-screen page.
  if (IS_CLOUD) {
    if (error) {
      return (
        <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      );
    }
    return <PageLoader viewport label="Redirecting to sign in…" />;
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex' }}>
      <Grid container sx={{ flex: 1 }}>
        {/* Left marketing panel */}
        <AuthMarketingPanel key="marketing-panel" />

        {/* Right panel — sign-up form */}
        <Grid
          key="signup-panel"
          size={{ xs: 12, md: 4 }}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 4,
          }}>
          {/* Mobile logo */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 3 }}>
            <ColorSchemeImage
              src={{ light: `${base}assets/images/logo/WSO2-Integration-Platform-Black.svg`, dark: `${base}assets/images/logo/WSO2-Integration-Platform-White.svg` }}
              alt={{ light: 'WSO2 Integration Platform Logo', dark: 'WSO2 Integration Platform Logo' }}
              sx={{ width: '100%', maxWidth: 260, height: 'auto' }}
            />
          </Box>

          {/* Main form area */}
          <Box sx={{ width: '100%', maxWidth: 360, mx: 'auto', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="h2">Sign Up</Typography>
              <RegionSelector currentPage="signup" />
            </Stack>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Already have an account?{' '}
              <Link component={NavLink} to={loginUrl()} underline="hover" color="primary">
                Sign In
              </Link>
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Stack gap={1.5}>
              <Button
                fullWidth
                variant="contained"
                color="secondary"
                startIcon={loading && provider === 'google' ? <CircularProgress size={20} color="inherit" /> : <Google />}
                onClick={() => handleSignup('google')}
                disabled={loading}
                sx={{ borderRadius: '28px', py: 1.25 }}>
                {loading && provider === 'google' ? 'Redirecting...' : 'Continue with Google'}
              </Button>

              <Button
                fullWidth
                variant="contained"
                color="secondary"
                startIcon={loading && provider === 'github' ? <CircularProgress size={20} color="inherit" /> : <GitHub />}
                onClick={() => handleSignup('github')}
                disabled={loading}
                sx={{ borderRadius: '28px', py: 1.25 }}>
                {loading && provider === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
              </Button>

              <Button
                fullWidth
                variant="contained"
                color="secondary"
                startIcon={loading && provider === 'microsoft' ? <CircularProgress size={20} color="inherit" /> : <MicrosoftIcon />}
                onClick={() => handleSignup('microsoft')}
                disabled={loading}
                sx={{ borderRadius: '28px', py: 1.25 }}>
                {loading && provider === 'microsoft' ? 'Redirecting...' : 'Continue with Microsoft'}
              </Button>

              <Divider sx={{ my: 0.5 }}>OR</Divider>

              <Button
                fullWidth
                variant="contained"
                color="secondary"
                startIcon={loading && provider === 'LOCAL' ? <CircularProgress size={20} color="inherit" /> : <Mail size={20} />}
                onClick={handleEmailSignup}
                disabled={loading}
                sx={{ borderRadius: '28px', py: 1.25 }}>
                {loading && provider === 'LOCAL' ? 'Redirecting...' : 'Sign up with Email'}
              </Button>
            </Stack>

            {/* Footer links */}
            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                More details at{' '}
                <Link href="https://wso2.com/integration-platform" target="_blank" rel="noopener noreferrer" underline="hover" color="primary">
                  wso2.com/integration-platform
                </Link>
              </Typography>
              <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.5}>
                <Link href={privacyPolicyUrl()} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  Privacy Policy
                </Link>
                <Typography sx={{ color: 'text.disabled', fontSize: '0.75rem' }}>|</Typography>
                <Link href="https://wso2.com/integration-platform/terms-of-use" target="_blank" rel="noopener noreferrer" underline="hover" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  Terms of Use
                </Link>
              </Stack>
            </Box>
          </Box>

          {/* WSO2 Identity Platform branding */}
          <Box sx={{ width: '100%', maxWidth: 360, mx: 'auto', mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Identity Management powered by{' '}
              <Link href="https://asgardeo.io" target="_blank" rel="noopener noreferrer" underline="hover" color="primary" sx={{ fontWeight: 600 }}>
                WSO2 Identity Platform
              </Link>{' '}
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
