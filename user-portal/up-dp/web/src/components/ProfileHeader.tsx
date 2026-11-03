/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { Avatar, Box, Divider, Typography } from '@wso2/oxygen-ui';
import ProfileRoles from './ProfileRoles';

/**
 * The top of the user menu, laid out as Oxygen UI's UserMenu.Header: the organization above the
 * user's name and email, and their roles under them as the Devant User Portal shows them.
 * UserMenu.Header takes no children.
 */
export default function ProfileHeader({ name, email, avatar, roles, org }: { name: string; email?: string; avatar: string; roles: string[]; org?: string }) {
  return (
    <>
      <Box sx={{ p: 2, pb: 1.5, minWidth: 280, maxWidth: 360, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', columnGap: 2 }}>
        <Avatar alt={name} sx={{ width: 40, height: 40, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 16, fontWeight: 600 }}>
          {avatar}
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
