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
