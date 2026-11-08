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

import { AppSwitcher, Box, type AppSwitcherAppItem } from '@wso2/oxygen-ui';
import { House, Settings } from '@wso2/oxygen-ui-icons-react';
import { useMemo, type JSX } from 'react';
import { buildPlatformSwitcher, CURRENT_PLATFORM } from '../config/platformSwitcher';
import { cloudConsoleHomeUrl, cloudConsoleOrganizationsUrl } from '../paths';
import { withBase } from '../utils/basePath';

const ICON_SIZE = 32;

// WSO2's pulse mark. currentColor takes the switcher's brand orange, faded on a coming-soon card.
function PulseIcon(): JSX.Element {
  return (
    <Box component="svg" sx={{ width: ICON_SIZE, height: ICON_SIZE }} viewBox="0 0 525.38 525.38" fill="none" aria-hidden>
      <path
        d="M293.19,358.72c-.22,0-.44,0-.66-.02-4.77-.29-8.83-3.58-10.09-8.19l-36.05-132.2-18.46,61.66c-1.41,4.71-5.75,7.95-10.67,7.95h-69.15c-6.15,0-11.14-4.99-11.14-11.14s4.99-11.14,11.14-11.14h60.86l27.26-91.03c1.42-4.72,5.75-7.95,10.67-7.95.04,0,.09,0,.14,0,4.97.06,9.3,3.41,10.61,8.21l37.62,137.94,16.3-40.22c1.7-4.21,5.79-6.96,10.33-6.96h55.4c6.15,0,11.14,4.99,11.14,11.14s-4.99,11.14-11.14,11.14h-47.9l-25.87,63.84c-1.71,4.22-5.81,6.96-10.32,6.96Z"
        fill="currentColor"
      />
      <path
        d="M262.69,458.58c-108.01,0-195.89-87.87-195.89-195.89s87.87-195.89,195.89-195.89,195.89,87.88,195.89,195.89-87.88,195.89-195.89,195.89ZM262.69,89.08c-95.72,0-173.6,77.88-173.6,173.61s77.88,173.6,173.6,173.6,173.6-77.88,173.6-173.6-77.88-173.61-173.6-173.61Z"
        fill="currentColor"
      />
    </Box>
  );
}

// On the shared origin the platforms read as one product: the same tab. Elsewhere, a new one.
const isSameOrigin = (url: string): boolean => {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
};

const sameTab = (url: string) => (isSameOrigin(url) ? { target: '_self' as const } : {});

/** WSO2 Cloud's nine-dot platform switcher, leading the header as in the WSO2 Cloud and Agent Platform consoles. */
export default function PlatformSwitcher(): JSX.Element {
  // Config is fixed once loaded.
  const apps = useMemo<AppSwitcherAppItem[]>(
    () =>
      // A URL-less card shows as coming soon.
      buildPlatformSwitcher(window.API_CONFIG, withBase('/')).map(({ id, name, url }) => ({ id, name, url, icon: <PulseIcon />, ...(url ? sameTab(url) : {}) })),
    [],
  );
  const manageLinks = useMemo(
    () =>
      [
        { id: 'cloud-home', name: 'Cloud home', url: cloudConsoleHomeUrl(), icon: <House size={18} /> },
        { id: 'settings', name: 'Settings', url: cloudConsoleOrganizationsUrl(), icon: <Settings size={18} /> },
      ].map((link) => ({ ...link, ...sameTab(link.url) })),
    [],
  );

  return (
    <AppSwitcher currentAppId={CURRENT_PLATFORM}>
      <AppSwitcher.Trigger label="Switch platforms" />
      <AppSwitcher.Section label="Categories" apps={apps} />
      <AppSwitcher.Footer label="Manage" links={manageLinks} columns={2} />
    </AppSwitcher>
  );
}
