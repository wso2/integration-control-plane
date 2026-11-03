/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
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

import { Navigate, Outlet } from 'react-router';
import { Box, ColorSchemeToggle, Layout, ParticleBackground, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useAuth } from '../auth';
import { orgHomeUrl, projectHomeUrl } from '../paths';
import { local } from '../utils/storage';

export default function PublicLayout(): JSX.Element {
  const { isAuthenticated, userId, orgHandle } = useAuth();

  // A signed-in session always carries its org, so the public pages hand over to it.
  if (isAuthenticated) {
    // Restore the last visited project if it belongs to the session's org
    try {
      const lastProjectRaw = local.get(`last_project:${userId}`);
      if (lastProjectRaw) {
        const { org: lastOrg, project } = JSON.parse(lastProjectRaw) as { org: string; project: string };
        if (lastOrg === orgHandle && project) {
          return <Navigate to={projectHomeUrl(orgHandle, project)} replace />;
        }
      }
    } catch {
      /* ignore malformed data */
    }

    return <Navigate to={orgHomeUrl(orgHandle)} replace />;
  }

  return (
    <Layout.Content>
      <ParticleBackground opacity={0.5} />
      <Box sx={{ height: '100%' }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            position: 'fixed',
            top: '1.5rem',
            right: '1.5rem',
            zIndex: 2,
          }}>
          <ColorSchemeToggle />
        </Stack>
        <Outlet />
      </Box>
    </Layout.Content>
  );
}
