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
import { buildEditorCallbackUrl, editorCallbackUri } from '../utils/vscodeCallback';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, Box, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { useAuth } from '../auth/AuthContext';
import { validateAndClearOIDCState, getAndClearRedirectUrl } from '../auth/tokenManager';
import { useFetchProjectsByOrgId } from '../hooks/useOrg';
import { fetchProjects as fetchProjectsApi } from '#api/projects';
import { loginUrl, projectHomeUrl, projectsRedirectUrl, registerOrgUrl } from '../paths';
import { IS_CLOUD } from '../features';
import { trackEvent } from '../utils/tracking';

export default function OIDCCallback(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleOIDCCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);
  const fetchProjects = useFetchProjectsByOrgId();

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const processCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const oidcError = searchParams.get('error');

      // A Cloud Editor cannot receive the provider's redirect itself: the client
      // registers a fixed set of callbacks and an editor's address is a
      // per-component subdomain that is not among them. So it asks to be
      // returned here and names itself in `state`, and this page forwards. The
      // target is checked against the same allowlist the GitHub callback uses,
      // because `state` reaches us by way of the provider and anyone who can
      // start a sign-in chooses its contents.
      //
      // Resolved before the error below is handled: a refused or failed sign-in
      // is a result the editor is waiting for, and swallowing it here leaves it
      // waiting for one that never comes. The editor is told what happened and
      // says so, rather than appearing to hang.
      const editorCallback = editorCallbackUri(state, {
        origins: window.API_CONFIG?.editorCallbackOrigins ?? [],
        domains: window.API_CONFIG?.editorCallbackDomains ?? [],
      });
      if (editorCallback) {
        window.location.href = buildEditorCallbackUrl(editorCallback, {
          code,
          state,
          error: oidcError,
          error_description: searchParams.get('error_description'),
        });
        return;
      }

      if (oidcError) {
        setError(`Authentication failed: ${searchParams.get('error_description') || oidcError}`);
        trackEvent('login-clickbutton-error');
        return;
      }

      if (!state) {
        setError('Missing state parameter. Please try logging in again.');
        trackEvent('login-clickbutton-error');
        return;
      }

      if (!validateAndClearOIDCState(state)) {
        setError('Invalid state parameter. This may indicate a CSRF attack. Please try logging in again.');
        trackEvent('login-clickbutton-error');
        return;
      }

      if (!code) {
        setError('Missing authorization code. Please try logging in again.');
        trackEvent('login-clickbutton-error');
        return;
      }

      try {
        const { isNewUser } = await handleOIDCCallback(code, state);

        if (!isNewUser) {
          trackEvent('login-clickbutton-success', undefined, true);
        }

        if (isNewUser && !IS_CLOUD) {
          // First-time user — no org yet; send to org registration.
          // In cloud, Thunder has already provisioned the org at sign-up,
          // so we fall through to the normal post-login routing below.
          navigate(registerOrgUrl(), { replace: true });
          return;
        }

        // Determine where to navigate post-login
        const savedUrl = getAndClearRedirectUrl();
        const savedPathname = savedUrl
          ? (() => {
              try {
                return new URL(savedUrl).pathname;
              } catch {
                return '';
              }
            })()
          : '';
        const isLoginPage = !savedPathname || savedPathname === loginUrl();
        const isDefaultOrg = savedPathname.startsWith('/organizations/default/') || savedPathname === '/organizations/default';

        if (savedUrl && !isLoginPage && !isDefaultOrg) {
          // User was trying to access a specific page — go back there
          window.location.href = savedUrl;
        } else {
          const rawOrgHandle = localStorage.getItem('org_handle');
          // 'default' is a placeholder — never treat it as a real org handle
          const orgHandle = rawOrgHandle && rawOrgHandle !== 'default' ? rawOrgHandle : null;

          // Try to navigate to the last visited project (for existing users)
          let navigatedToLastProject = false;
          try {
            const stored = localStorage.getItem('user');
            const userId: string | undefined = stored ? (JSON.parse(stored) as { userId?: string })?.userId : undefined;

            if (userId && orgHandle) {
              // 1. Try the last-visited project stored by AppLayout
              const lastProjectRaw = localStorage.getItem(`last_project:${userId}`);
              if (lastProjectRaw) {
                const { org, project } = JSON.parse(lastProjectRaw) as { org: string; project: string };
                if (org === orgHandle && project) {
                  // Mark ToS accepted — this user has already been through onboarding
                  localStorage.setItem(`tos_accepted:${userId}:${orgHandle}`, 'true');
                  navigate(projectHomeUrl(orgHandle, project), { replace: true });
                  navigatedToLastProject = true;
                }
              }

              // 2. No stored last project — fetch from API and use the most recently updated one.
              // In cloud the numericId concept doesn't exist (Thunder doesn't issue one); fall
              // back to the JWT-scoped fetchProjects which ignores the orgId argument.
              if (!navigatedToLastProject) {
                const numericId = window.API_CONFIG.asgardeoOrgNumericId ?? parseInt(localStorage.getItem('org_numeric_id') ?? '0', 10);
                const projects = IS_CLOUD ? (await fetchProjectsApi(0)).filter((p) => p.handler) : numericId > 0 ? (await fetchProjects(numericId)).filter((p) => p.handler) : [];
                if (projects.length > 0) {
                  const recent = projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
                  // Mark ToS accepted — this user already has projects, they've been through onboarding
                  localStorage.setItem(`tos_accepted:${userId}:${orgHandle}`, 'true');
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
        trackEvent('login-clickbutton-error');
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
