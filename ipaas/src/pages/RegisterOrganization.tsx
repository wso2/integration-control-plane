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

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { Alert, Box, Button, Checkbox, CircularProgress, ColorSchemeImage, Divider, FormControlLabel, InputAdornment, InputLabel, Link, OutlinedInput, Stack, Typography } from '@wso2/oxygen-ui';
import { Building2, CheckCircle, XCircle } from '@wso2/oxygen-ui-icons-react';

import { useAuth } from '../auth/AuthContext';
import { useRegisterUser, useValidateOrgName } from '../hooks/useOrg';
import type { RegisterUserResponse } from '../types/org';
import { loginUrl, orgHomeUrl, privacyPolicyUrl } from '../paths';
import { trackEvent } from '../utils/tracking';

const ORG_NAME_RE = /^[A-Za-z][A-Za-z0-9\-_ ]+$/;
const SERVICE_NAME = 'WSO2 Integration Platform';

function validateOrgNameLocally(name: string): string | null {
  if (name.length < 4 || name.length > 30) return 'Name must be between 4 and 30 characters.';
  if (!/^[A-Za-z]/.test(name)) return 'Name must begin with a letter.';
  if (!ORG_NAME_RE.test(name)) return 'Name may only contain letters, numbers, hyphens, underscores, and spaces.';
  return null;
}

export default function RegisterOrganization(): JSX.Element {
  const navigate = useAppNavigate();
  const { completeOrgRegistration, logout, isAuthenticated, displayName } = useAuth();
  const base = import.meta.env.BASE_URL;

  const [orgName, setOrgName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isNameAvailable, setIsNameAvailable] = useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validateOrgNameMutation = useValidateOrgName();
  const registerUserMutation = useRegisterUser();

  // Redirect away if not authenticated (shouldn't happen normally)
  useEffect(() => {
    if (!isAuthenticated) navigate(loginUrl(), { replace: true });
  }, [isAuthenticated, navigate]);

  // Clear any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const handleOrgNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOrgName(value);
    setIsNameAvailable(null);
    setCreateError(null);

    const err = validateOrgNameLocally(value);
    setLocalError(err);

    if (err || !value) return;

    // Debounced backend uniqueness check
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    debounceRef.current = setTimeout(async () => {
      setIsValidating(true);
      try {
        setIsNameAvailable(await validateOrgNameMutation.mutateAsync(value));
      } catch {
        setIsNameAvailable(true);
      } finally {
        setIsValidating(false);
      }
    }, 800);
  };

  const handleCreate = async () => {
    const err = validateOrgNameLocally(orgName);
    if (err) {
      setLocalError(err);
      return;
    }

    setCreateError(null);
    setIsCreating(true);
    try {
      const data: RegisterUserResponse = await registerUserMutation.mutateAsync({ orgName, termsAccepted, serviceName: SERVICE_NAME });
      const orgs = data.organizations ?? [];
      const created = orgs[0];

      if (!created) {
        throw new Error('No organization returned from the server. Please try again.');
      }

      const handle = created.handle ?? created.orgHandle;
      if (!handle) throw new Error('Organization handle missing in response.');

      // Update numeric org ID if provided
      const numericId = created.id ?? created.orgId;
      if (numericId) {
        const parsed = typeof numericId === 'string' ? parseInt(numericId, 10) : numericId;
        window.API_CONFIG.asgardeoOrgNumericId = parsed;
        localStorage.setItem('org_numeric_id', String(parsed));
      }

      // Exchange for org-scoped STS token
      await completeOrgRegistration(handle);
      trackEvent('signup-success', undefined, true);
      navigate(orgHomeUrl(handle), { replace: true });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create organization. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const isNameValid = !localError && orgName.length >= 4;
  const canSubmit = isNameValid && isNameAvailable !== false && termsAccepted && !isCreating && !isValidating;

  const nameAdornment = () => {
    if (!orgName) return null;
    if (isValidating) return <CircularProgress size={18} />;
    if (localError || isNameAvailable === false) return <XCircle size={18} color="error" />;
    if (isNameValid && isNameAvailable !== false) return <CheckCircle size={18} color="success" />;
    return null;
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
      <Box sx={{ width: '100%', maxWidth: 480 }}>
        <Stack alignItems="center" mb={4}>
          <ColorSchemeImage
            src={{ light: `${base}assets/images/logo/WSO2-Integration-Platform-Black.svg`, dark: `${base}assets/images/logo/WSO2-Integration-Platform-White.svg` }}
            alt={{ light: 'WSO2 Integration Platform Logo', dark: 'WSO2 Integration Platform Logo' }}
            height={48}
            width="auto"
          />
        </Stack>

        <Typography variant="h4" gutterBottom>
          Almost there!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {displayName ? `Welcome, ${displayName}! ` : ''}Create your organization to get started with WSO2 Integration Platform.
        </Typography>

        {createError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {createError}
          </Alert>
        )}

        <Stack gap={2}>
          <Box>
            <InputLabel htmlFor="org-name" sx={{ mb: 0.5 }}>
              Organization Name
            </InputLabel>
            <OutlinedInput
              id="org-name"
              fullWidth
              placeholder="Enter your organization name"
              value={orgName}
              onChange={handleOrgNameChange}
              disabled={isCreating}
              error={!!localError || isNameAvailable === false}
              startAdornment={
                <InputAdornment position="start">
                  <Building2 size={18} />
                </InputAdornment>
              }
              endAdornment={<InputAdornment position="end">{nameAdornment()}</InputAdornment>}
              size="small"
            />
            {(localError || isNameAvailable === false) && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                {localError ?? 'This organization name is already taken.'}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              4–30 characters. Must start with a letter. Letters, numbers, hyphens, underscores, and spaces allowed.
            </Typography>
          </Box>

          <Divider />

          <FormControlLabel
            control={<Checkbox checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} disabled={isCreating} />}
            label={
              <Typography variant="body2">
                I agree to the{' '}
                <Link href="https://wso2.com/integration-platform/terms-of-use" target="_blank" rel="noopener noreferrer">
                  Terms of Use
                </Link>{' '}
                and{' '}
                <Link href={privacyPolicyUrl()} target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>
              </Typography>
            }
          />

          <Button variant="contained" color="primary" fullWidth onClick={handleCreate} disabled={!canSubmit} startIcon={isCreating ? <CircularProgress size={18} color="inherit" /> : undefined}>
            {isCreating ? 'Creating...' : 'Create Organization'}
          </Button>

          <Button variant="outlined" color="secondary" size="small" onClick={() => logout().then(() => navigate(loginUrl()))} disabled={isCreating}>
            Sign out and use a different account
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
