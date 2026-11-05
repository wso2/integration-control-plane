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

import { Box, PageTitle, Tab, Tabs } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import type { SettingsSectionDef } from '../../constants/orgSettingsSections';

interface ConfigureTabsProps {
  /** Id of the active section. */
  active: string;
  /** Sections to show, already filtered to those the user can access. */
  sections: readonly SettingsSectionDef[];
  /** Navigate to the chosen section's path. */
  onSelect: (path: string) => void;
}

/**
 * Presentational "Configure" header (title + tab bar) shared by the Org, Project,
 * and Integration settings shells. Each scope-specific wrapper resolves its own
 * visible sections + navigation; this owns only the chrome.
 */
export default function ConfigureTabs({ active, sections, onSelect }: ConfigureTabsProps): JSX.Element {
  const activeIndex = sections.findIndex((s) => s.id === active);
  return (
    <>
      <PageTitle>
        <PageTitle.Header>Configure</PageTitle.Header>
      </PageTitle>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeIndex < 0 ? false : activeIndex} onChange={(_, v) => onSelect(sections[v].path)} variant="scrollable" scrollButtons="auto">
          {sections.map((s) => (
            <Tab key={s.id} label={s.label} />
          ))}
        </Tabs>
      </Box>
    </>
  );
}
