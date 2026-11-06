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

import { Permissions } from '../../constants/permissions';
import type { SettingsSectionDef } from '../../constants/orgSettingsSections';

/** Project Settings sections, kept for the unported pages that still show the project settings tabs. */
export const PROJECT_SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [{ id: 'project-overview', label: 'Project', path: 'project-overview', permissions: [Permissions.PROJECT_MANAGE, Permissions.PROJECT_EDIT] }];
