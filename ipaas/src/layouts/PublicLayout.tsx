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
import { useAuth } from '#auth';
import { orgHomeUrl, projectHomeUrl, registerOrgUrl } from '../paths';

export default function PublicLayout(): JSX.Element {
  const { isAuthenticated, userId } = useAuth();

  if (isAuthenticated) {
    const storedOrg = localStorage.getItem('org_handle');
    const org = storedOrg && storedOrg !== 'default' ? storedOrg : null;

    // Restore the last visited project if it matches the stored org
    if (org && userId) {
      try {
        const lastProjectRaw = localStorage.getItem(`last_project:${userId}`);
        if (lastProjectRaw) {
          const { org: lastOrg, project } = JSON.parse(lastProjectRaw) as { org: string; project: string };
          if (lastOrg === org && project) {
            return <Navigate to={projectHomeUrl(org, project)} replace />;
          }
        }
      } catch {
        /* ignore malformed data */
      }
    }

    return <Navigate to={org ? orgHomeUrl(org) : registerOrgUrl()} replace />;
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
