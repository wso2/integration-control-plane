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

import { Box, PageContent, Tab, Tabs } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import OrgSettingsTabs from '../../components/Settings/OrgSettingsTabs';
import IdentityProvidersTab from '../components/Settings/AppSecurity/IdentityProvidersTab';
import RoleManagementTab from '../components/Settings/AppSecurity/RoleManagementTab';
import StsTab from '../components/Settings/AppSecurity/StsTab';
import { orgSettingsSectionUrl, type OrgScope } from '../../nav';

const SUB_TABS = ['identity-providers', 'role-management', 'security-token-service'] as const;
const SUB_TAB_LABELS = ['Identity Providers', 'Role Management', 'Security Token Service'];

export default function ApplicationSecurity({ org }: OrgScope): JSX.Element {
  const { tab = 'identity-providers' } = useParams();
  const navigate = useAppNavigate();

  const index = SUB_TABS.indexOf(tab as (typeof SUB_TABS)[number]);
  const safeIndex = index < 0 ? 0 : index;

  return (
    <PageContent>
      <OrgSettingsTabs active="application-security" />
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={safeIndex} onChange={(_, v) => navigate(orgSettingsSectionUrl({ org }, `application-security/${SUB_TABS[v]}`))} variant="scrollable" scrollButtons="auto">
          {SUB_TAB_LABELS.map((label) => (
            <Tab key={label} label={label} />
          ))}
        </Tabs>
      </Box>
      {safeIndex === 0 && <IdentityProvidersTab orgHandler={org} />}
      {safeIndex === 1 && <RoleManagementTab />}
      {safeIndex === 2 && <StsTab orgHandler={org} />}
    </PageContent>
  );
}
