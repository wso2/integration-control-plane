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

import { Navigate, useParams } from 'react-router';
import type { JSX } from 'react';
import { componentUrl, orgHomeUrl, projectHomeUrl } from '../paths';
import type { Level } from '../nav';

/**
 * Target of the level catch-all routes in `config/routes.tsx`: an unknown or retired
 * URL bounces to the enclosing scope's landing page instead of rendering an empty shell.
 */
export default function HiddenPageRedirect({ level }: { level: Level }): JSX.Element {
  const { orgHandler = '', projectHandler = '', componentHandler = '' } = useParams();
  const to = level === 'components' ? componentUrl(orgHandler, projectHandler, componentHandler) : level === 'projects' ? projectHomeUrl(orgHandler, projectHandler) : orgHomeUrl(orgHandler);
  return <Navigate to={to} replace />;
}
