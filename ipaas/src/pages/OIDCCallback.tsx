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
import { editorSignInForwardUrl } from '../utils/vscodeCallback';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, Box, Typography } from '@wso2/oxygen-ui';
import PageLoader from '../components/PageLoader';
import { useAuth, getAndClearRedirectUrl } from '../auth';
import { fetchProjects as fetchProjectsApi } from '../api/projects';
import { loginUrl, projectHomeUrl, projectsRedirectUrl } from '../paths';
import { trackEvent } from '../services/tracking/tracking';
import { stripBase, withBase } from '../utils/basePath';
import { local } from '../utils/storage';

export default function OIDCCallback(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeSignIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const processCallback = async () => {
      // Resolved before anything else, a failed sign-in included: see
      // editorSignInForwardUrl. The target is checked against the same
      // allowlist the GitHub callback uses, because `state` reaches us by way of
      // the provider and anyone who can start a sign-in chooses its contents.
      const editorUrl = editorSignInForwardUrl(searchParams, {
        origins: window.API_CONFIG?.editorCallbackOrigins ?? [],
        domains: window.API_CONFIG?.editorCallbackDomains ?? [],
      });
      if (editorUrl) {
        window.location.href = editorUrl;
        return;
      }

      try {
        // Thunder provisions the org at sign-up, so a signed-in session always carries one.
        const { userId, orgHandle } = await completeSignIn(searchParams);
        trackEvent('login-clickbutton-success', undefined, true);

        // Determine where to navigate post-login
        const savedUrl = getAndClearRedirectUrl();
        const savedPathname = savedUrl
          ? (() => {
              try {
                return stripBase(new URL(savedUrl).pathname);
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
          // Try to navigate to the last visited project (for existing users)
          let navigatedToLastProject = false;
          try {
            // 1. Try the last-visited project stored by AppLayout
            const lastProjectRaw = local.get(`last_project:${userId}`);
            if (lastProjectRaw) {
              const { org, project } = JSON.parse(lastProjectRaw) as { org: string; project: string };
              if (org === orgHandle && project) {
                // Mark ToS accepted — this user has already been through onboarding
                local.set(`tos_accepted:${userId}:${orgHandle}`, 'true');
                navigate(projectHomeUrl(orgHandle, project), { replace: true });
                navigatedToLastProject = true;
              }
            }

            // 2. No stored last project — fetch from API and use the most recently updated one.
            if (!navigatedToLastProject) {
              const projects = (await fetchProjectsApi()).filter((p) => p.handler);
              if (projects.length > 0) {
                const recent = projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
                // Mark ToS accepted — this user already has projects, they've been through onboarding
                local.set(`tos_accepted:${userId}:${orgHandle}`, 'true');
                navigate(projectHomeUrl(orgHandle, recent.handler), { replace: true });
                navigatedToLastProject = true;
              }
            }
          } catch {
            // ignore — fall through to default
          }

          if (!navigatedToLastProject) {
            // Redirect to the projects/redirect route which shows the ToS welcome dialog.
            navigate(projectsRedirectUrl(orgHandle), { replace: true });
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
          <a href={withBase(loginUrl())}>Return to Login</a>
        </Box>
      </Box>
    );
  }

  return <PageLoader viewport label="Completing sign in…" />;
}
