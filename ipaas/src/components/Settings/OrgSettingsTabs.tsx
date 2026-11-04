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
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { SETTINGS_SECTIONS, isSettingsSectionVisible } from '../../constants/orgSettingsSections';
import { orgSettingsSectionUrl, useScope } from '../../nav';
import SettingsTabs from './SettingsTabs';

/** The org Manage header — resolves the visible sections and delegates chrome to `SettingsTabs`. */
export default function OrgSettingsTabs({ active }: { active: string }): JSX.Element {
  const scope = useScope();
  const navigate = useAppNavigate();
  const { hasAnyPermission } = useAccessControl();

  const visible = SETTINGS_SECTIONS.filter((s) => isSettingsSectionVisible(s, hasAnyPermission));
  return <SettingsTabs active={active} sections={visible} onSelect={(path) => navigate(orgSettingsSectionUrl(scope, path))} />;
}
