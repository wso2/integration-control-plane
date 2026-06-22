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
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, Box, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { useAuth } from '../auth/AuthContext';
import { validateAndClearOIDCState, getAndClearRedirectUrl } from '../auth/oauthState';
import { useFetchProjectsByOrgId } from '../hooks/useOrg';
import { useFetchProjects } from '../hooks/useProjects';
import { loginUrl, projectHomeUrl, projectsRedirectUrl, registerOrgUrl } from '../paths';
import { IS_CLOUD } from '../features';

export default function OIDCCallback(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOIDCCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);
  const fetchProjectsByOrgId = useFetchProjectsByOrgId();
  const fetchProjects = useFetchProjects();

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const oidcError = searchParams.get('error');

      if (oidcError) {
        setError(`Authentication failed: ${searchParams.get('error_description') || oidcError}`);
        return;
      }

      if (!state) {
        setError('Missing state parameter. Please try logging in again.');
        return;
      }

      if (!validateAndClearOIDCState(state)) {
        setError('Invalid state parameter. This may indicate a CSRF attack. Please try logging in again.');
        return;
      }

      if (!code) {
        setError('Missing authorization code. Please try logging in again.');
        return;
      }

      try {
        const { isNewUser } = await handleOIDCCallback(code, state);

        if (isNewUser && !IS_CLOUD) {
          // First-time user — no org yet; send to org registration.
          // In cloud, Thunder has already provisioned the org at sign-up,
          // so we fall through to the normal post-login routing below.
          navigate(registerOrgUrl(), { replace: true });
          return;
        }

        // Determine where to navigate post-login
        const savedUrl = getAndClearRedirectUrl();
        const isLoginPage = savedUrl ? new URL(savedUrl).pathname === loginUrl() : true;

        if (savedUrl && !isLoginPage) {
          // User was trying to access a specific page — go back there
          window.location.href = savedUrl;
        } else {
          const orgHandle = localStorage.getItem('icp_org_handle');

          // Try to navigate to the last visited project (for existing users)
          let navigatedToLastProject = false;
          try {
            const stored = localStorage.getItem('icp_user');
            const userId: string | undefined = stored ? (JSON.parse(stored) as { userId?: string })?.userId : undefined;

            if (userId && orgHandle) {
              // 1. Try the last-visited project stored by AppLayout
              const lastProjectRaw = localStorage.getItem(`icp_last_project:${userId}`);
              if (lastProjectRaw) {
                const { org, project } = JSON.parse(lastProjectRaw) as { org: string; project: string };
                if (org === orgHandle && project) {
                  // Mark ToS accepted — this user has already been through onboarding
                  localStorage.setItem(`icp_tos_accepted:${userId}:${orgHandle}`, 'true');
                  navigate(projectHomeUrl(orgHandle, project), { replace: true });
                  navigatedToLastProject = true;
                }
              }

              // 2. No stored last project — fetch from API and use the most recently updated one.
              // In cloud the numericId concept doesn't exist (Thunder doesn't issue one); fall
              // back to the JWT-scoped fetchProjects which ignores the orgId argument.
              if (!navigatedToLastProject) {
                const numericId = window.API_CONFIG.asgardeoOrgNumericId ?? parseInt(localStorage.getItem('icp_org_numeric_id') ?? '0', 10);
                const projects = IS_CLOUD ? (await fetchProjects()).filter((p) => p.handler) : numericId > 0 ? (await fetchProjectsByOrgId(numericId)).filter((p) => p.handler) : [];
                if (projects.length > 0) {
                  const recent = projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
                  // Mark ToS accepted — this user already has projects, they've been through onboarding
                  localStorage.setItem(`icp_tos_accepted:${userId}:${orgHandle}`, 'true');
                  navigate(projectHomeUrl(orgHandle, recent.handler), { replace: true });
                  navigatedToLastProject = true;
                }
              }
            }
          } catch {
            // ignore — fall through to default
          }

          if (!navigatedToLastProject) {
            // Redirect to the projects/redirect route which shows the ToS welcome dialog.
            // In cloud, if orgHandle is missing from localStorage we surface an
            // error rather than route to RegisterOrganization (it is a no-op in
            // cloud, and hitting it means the Thunder login flow did not seed
            // the org handle).
            if (!orgHandle && IS_CLOUD) {
              setError('Missing organization context after sign-in. Please try logging in again.');
              return;
            }
            navigate(orgHandle ? projectsRedirectUrl(orgHandle) : registerOrgUrl(), { replace: true });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to complete authentication');
      }
    };

    processCallback();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
        <Box sx={{ maxWidth: 480, textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Please try logging in again.
          </Typography>
          <a href={loginUrl()}>Return to Login</a>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <Box sx={{ textAlign: 'center' }}>
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="body1" color="text.secondary">
          Completing sign in...
        </Typography>
      </Box>
    </Box>
  );
}
