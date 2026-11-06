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

import type { JSX } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth';
import PageNotFound from '../pages/PageNotFound';
import { loginUrl } from '../paths';

/**
 * Target of the app-wide catch-all route. A signed-out visitor is sent to sign in rather
 * than told the page is missing, so an unknown URL reveals nothing about which routes exist.
 */
export default function UnknownRoute(): JSX.Element {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to={loginUrl()} replace />;
  return <PageNotFound fullScreen />;
}
