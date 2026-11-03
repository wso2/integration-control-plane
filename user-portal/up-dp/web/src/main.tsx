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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { answerFrameSignIn, AuthProvider, configureAuth } from './auth';
import { ToastProvider } from './components/Toast';
import { PortalConfigProvider, readPageConfig } from './config/portalConfig';
import { resolveTheme } from './config/themes';
import './i18n';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

// Without a config the portal still renders under its default name and theme; starting the session reports the outage.
const config = readPageConfig();
configureAuth(config.auth);

// In the hidden sign-in frame, the callback page only hands the answer back to the portal page that opened it.
if (!answerFrameSignIn()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <OxygenUIThemeProvider theme={resolveTheme(config.theme, config.primaryColor)}>
        <PortalConfigProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AuthProvider>
                <ToastProvider>
                  <App />
                </ToastProvider>
              </AuthProvider>
            </BrowserRouter>
          </QueryClientProvider>
        </PortalConfigProvider>
      </OxygenUIThemeProvider>
    </StrictMode>,
  );
}
