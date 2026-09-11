/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com).
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

import { OxygenUIThemeProvider, AcrylicOrangeTheme } from '@wso2/oxygen-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './auth/AuthContext';
import { loadConfig } from './config/api';
import { AccessControlProvider } from './contexts/AccessControlContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { TimeZoneProvider } from './contexts/TimeZoneContext';
import { AuthError } from './api/graphql';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never retry auth failures — the token is gone and navigation to login has already
      // been triggered. Retrying only keeps the UI stuck in a loading state.
      retry: (failureCount, error) => !(error instanceof AuthError) && failureCount < 3,
      // Don't refetch every time the browser tab/window regains focus. Returning to
      // the app would otherwise re-run all active queries and flash loading states
      // (e.g. the logs view spinner). Data still refreshes on mount, on manual
      // refresh actions, and via configured refetchInterval/invalidation.
      refetchOnWindowFocus: false,
    },
  },
});

// Load runtime configuration before rendering the app
loadConfig().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <OxygenUIThemeProvider themes={[{ key: 'acrylicOrange', label: 'Acrylic Orange Theme', theme: AcrylicOrangeTheme }]} initialTheme="acrylicOrange">
        <NotificationsProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AuthProvider>
                <AccessControlProvider>
                  <TimeZoneProvider>
                    <ErrorBoundary>
                      <App />
                    </ErrorBoundary>
                  </TimeZoneProvider>
                </AccessControlProvider>
              </AuthProvider>
            </BrowserRouter>
          </QueryClientProvider>
        </NotificationsProvider>
      </OxygenUIThemeProvider>
    </StrictMode>,
  );
});
