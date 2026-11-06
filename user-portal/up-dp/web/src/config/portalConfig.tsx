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

import { createContext, useContext, type ReactNode } from 'react';
import type { PortalConfig } from '../types/portal';

/** The WSO2 Integration Platform wordmark, as the integration console shows it. */
export const BUNDLED_LOGO = {
  light: '/assets/images/logo/WSO2-Integration-Platform-Black.svg',
  dark: '/assets/images/logo/WSO2-Integration-Platform-White.svg',
};

/** What UP-DP was deployed with, read once before the first render. */

export const FALLBACK_CONFIG: PortalConfig = {
  portalName: 'User Portal',
  productName: 'Integration Platform',
  orgHandle: '',
  orgName: '',
  theme: '',
  links: {},
  logo: BUNDLED_LOGO,
  auth: { issuer: '', clientId: '', resource: '' },
};

declare global {
  interface Window {
    /** Set by UP-DP's `/config.js`, which the page loads before the SPA. */
    __UP_DP_CONFIG__?: Partial<Omit<PortalConfig, 'logo'>> & { logo?: Partial<PortalConfig['logo']> };
  }
}

/** The config UP-DP's `/config.js` set, or the fallback when there is none to read. */
export function readPageConfig(): PortalConfig {
  const config = window.__UP_DP_CONFIG__;
  if (!config || typeof config !== 'object') return FALLBACK_CONFIG;
  return { ...FALLBACK_CONFIG, ...config, links: { ...config.links }, logo: { ...FALLBACK_CONFIG.logo, ...config.logo }, auth: { ...FALLBACK_CONFIG.auth, ...config.auth } };
}

const PortalConfigContext = createContext<PortalConfig>(FALLBACK_CONFIG);

export function PortalConfigProvider({ config, children }: { config: PortalConfig; children: ReactNode }) {
  return <PortalConfigContext.Provider value={config}>{children}</PortalConfigContext.Provider>;
}

export function usePortalConfig(): PortalConfig {
  return useContext(PortalConfigContext);
}
