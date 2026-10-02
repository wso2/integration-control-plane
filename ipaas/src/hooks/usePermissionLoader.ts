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

import { useEffect, useRef } from 'react';
import { useAuth } from '#auth';
import { useAccessControl } from '../contexts/AccessControlContext';
import { fetchProjectPermissions, fetchComponentPermissions } from '#api/auth';

export function useLoadProjectPermissions(orgHandle: string, projectId: string) {
  const { userId, isOidcUser } = useAuth();
  const { setProjectPermissions, clearProjectPermissions } = useAccessControl();
  const loadedRef = useRef<string>('');

  useEffect(() => {
    // OIDC users get all permissions granted at org level in AppLayout — skip local auth API
    if (!projectId || !userId || isOidcUser) return;

    // If switching to a different project, clear previous permissions
    if (loadedRef.current && loadedRef.current !== projectId) {
      clearProjectPermissions();
    }

    if (loadedRef.current === projectId) return;
    loadedRef.current = projectId;

    fetchProjectPermissions(orgHandle, userId, projectId)
      .then((data) => setProjectPermissions(projectId, data.permissionNames))
      .catch((err) => console.error('Failed to fetch project permissions', err));
  }, [orgHandle, projectId, userId, isOidcUser, setProjectPermissions, clearProjectPermissions]);
}

export function useLoadComponentPermissions(orgHandle: string, projectId: string, componentId: string) {
  const { userId, isOidcUser } = useAuth();
  const { setComponentPermissions, clearComponentPermissions } = useAccessControl();
  const loadedRef = useRef<string>('');

  useEffect(() => {
    // OIDC users get all permissions granted at org level in AppLayout — skip local auth API
    if (!componentId || !projectId || !userId || isOidcUser) return;

    // If switching to a different component, clear previous permissions
    if (loadedRef.current && loadedRef.current !== componentId) {
      clearComponentPermissions();
    }

    // Skip if already loaded for this component
    if (loadedRef.current === componentId) return;

    loadedRef.current = componentId;

    fetchComponentPermissions(orgHandle, userId, projectId, componentId)
      .then((data) => setComponentPermissions(componentId, data.permissionNames))
      .catch((err) => console.error('Failed to fetch component permissions', err));
  }, [orgHandle, projectId, componentId, userId, isOidcUser, setComponentPermissions, clearComponentPermissions]);
}
