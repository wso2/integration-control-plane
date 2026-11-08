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

import { Avatar, Box, Divider, Typography } from '@wso2/oxygen-ui';
import ProfileRoles from './ProfileRoles';

/**
 * The top of the user menu, laid out as Oxygen UI's UserMenu.Header: the organization above the
 * user's name and email, and their roles under them as the Devant User Portal shows them.
 * UserMenu.Header takes no children.
 */
export default function ProfileHeader({ name, email, initials, picture, roles, org }: { name: string; email?: string; initials: string; picture?: string; roles: string[]; org?: string }) {
  return (
    <>
      <Box sx={{ p: 2, pb: 1.5, minWidth: 280, maxWidth: 360, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', columnGap: 2 }}>
        <Avatar alt={name} src={picture} sx={{ width: 40, height: 40, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 16, fontWeight: 600 }}>
          {initials}
        </Avatar>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          {org && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {org}
            </Typography>
          )}
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {email ?? ''}
          </Typography>
        </Box>
        {roles.length > 0 && (
          <Box sx={{ gridColumn: 2, width: 0, minWidth: '100%' }}>
            <ProfileRoles roles={roles} />
          </Box>
        )}
      </Box>
      <Divider />
    </>
  );
}
