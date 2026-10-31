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
import { Navigate, Outlet } from 'react-router';
import { saveRedirectUrl, useAuth } from '../auth';
import { useAccessControl } from '../contexts/AccessControlContext';
import { loginUrl } from '../paths';
import PermissionDeniedNotice from '../components/PermissionDeniedNotice';
import { Permissions } from '../constants/permissions';
import { sessionPermissions } from '../utils/permissions';

export default function ProtectedRoute(): JSX.Element {
  const { isAuthenticated, userId, scopes } = useAuth();
  const { setOrgPermissions } = useAccessControl();

  useEffect(() => {
    // The org-scoped token is the authorization: its scopes gate actions, and the legacy
    // permissions, which nothing grants, stay open.
    setOrgPermissions(isAuthenticated && userId ? [...Object.values(Permissions), ...sessionPermissions(scopes)] : []);
  }, [isAuthenticated, userId, scopes, setOrgPermissions]);

  if (!isAuthenticated) {
    saveRedirectUrl(window.location.href);
    return <Navigate to={loginUrl()} replace />;
  }

  return (
    <>
      <Outlet />
      <PermissionDeniedNotice />
    </>
  );
}
