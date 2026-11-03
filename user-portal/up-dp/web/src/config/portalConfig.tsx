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
  auth: { issuer: '', clientId: '' },
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
