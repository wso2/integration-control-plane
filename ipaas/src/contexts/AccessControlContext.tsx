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

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode, JSX } from 'react';

interface AccessControlContextType {
  isOrgPermissionsLoaded: boolean;
  setOrgPermissions: (permissions: string[]) => void;
  hasOrgPermission: (permission: string) => boolean;
  /**
   * Permissions are granted for the whole organization; the access token carries no finer scope.
   * The project and integration ids are accepted so call sites can state the scope they act in.
   */
  hasPermission: (permission: string, projectId?: string, componentId?: string) => boolean;
  hasAllPermissions: (permissions: string[], projectId?: string, componentId?: string) => boolean;
  hasAnyPermission: (permissions: string[], projectId?: string, componentId?: string) => boolean;
}

const AccessControlContext = createContext<AccessControlContextType | undefined>(undefined);

export function AccessControlProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isOrgPermissionsLoaded, setIsOrgPermissionsLoaded] = useState(false);
  const [orgPerms, setOrgPerms] = useState<Set<string>>(new Set());

  const setOrgPermissions = useCallback((permissions: string[]) => {
    setOrgPerms(new Set(permissions));
    setIsOrgPermissionsLoaded(true);
  }, []);

  const hasOrgPermission = useCallback((permission: string) => orgPerms.has(permission), [orgPerms]);

  const hasAllPermissions = useCallback((permissions: string[]) => permissions.every(hasOrgPermission), [hasOrgPermission]);

  const hasAnyPermission = useCallback((permissions: string[]) => permissions.some(hasOrgPermission), [hasOrgPermission]);

  const value = useMemo<AccessControlContextType>(
    () => ({ isOrgPermissionsLoaded, setOrgPermissions, hasOrgPermission, hasPermission: hasOrgPermission, hasAllPermissions, hasAnyPermission }),
    [isOrgPermissionsLoaded, setOrgPermissions, hasOrgPermission, hasAllPermissions, hasAnyPermission],
  );

  return <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAccessControl(): AccessControlContextType {
  const context = useContext(AccessControlContext);
  if (!context) {
    throw new Error('useAccessControl must be used within AccessControlProvider');
  }
  return context;
}
