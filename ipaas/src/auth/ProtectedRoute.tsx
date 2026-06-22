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

import { useEffect } from 'react';
import type { JSX } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext';
import { useAccessControl } from '../contexts/AccessControlContext';
import { fetchOrgPermissions } from '#api/auth';
import { loginUrl, forceChangePasswordUrl } from '../paths';
import { saveRedirectUrl } from './oauthState';
import { Permissions } from '../constants/permissions';

export default function ProtectedRoute(): JSX.Element {
  const { isAuthenticated, userId, requirePasswordChange, isOidcUser } = useAuth();
  const { setOrgPermissions } = useAccessControl();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setOrgPermissions([]);
      return;
    }

    if (isOidcUser) {
      // OIDC users are authorized by Choreo/WSO2 Identity Platform with an org-scoped STS token.
      // The local ICP permission backend does not apply — grant all ipass permissions.
      setOrgPermissions(Object.values(Permissions));
      return;
    }

    // For local-auth users, extract the org handle from the current URL path.
    // Skip fetching on non-org routes (e.g. /profile, /change-password).
    const orgMatch = pathname.match(/^\/organizations\/([^/]+)/);
    if (!orgMatch) return;
    fetchOrgPermissions(orgMatch[1], userId)
      .then((data) => setOrgPermissions(data.permissionNames))
      .catch((err) => {
        setOrgPermissions([]);
        console.error('Failed to fetch org permissions', err);
      });
  }, [isAuthenticated, userId, isOidcUser, pathname, setOrgPermissions]);

  if (!isAuthenticated) {
    saveRedirectUrl(window.location.href);
    return <Navigate to={loginUrl()} replace />;
  }

  if (requirePasswordChange && pathname !== forceChangePasswordUrl()) {
    return <Navigate to={forceChangePasswordUrl()} replace />;
  }

  return <Outlet />;
}
