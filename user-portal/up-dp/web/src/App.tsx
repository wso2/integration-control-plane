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

import { Button } from '@wso2/oxygen-ui';
import { useTranslation } from './i18n';
import { Navigate, Route, Routes } from 'react-router';
import { useAuth, VIEW_SCOPES } from './auth';
import { usePortalConfig } from './config/portalConfig';
import AppLayout from './layouts/AppLayout';
import IntegrationPage from './pages/IntegrationPage';
import IntegrationsPage from './pages/IntegrationsPage';
import OverviewPage from './pages/OverviewPage';
import StatusPage, { Splash } from './pages/StatusPage';
import TasksPage from './pages/TasksPage';
import { KIND_SEGMENTS } from './paths';

/** The signed-in app. A tab with no session is sent to sign in by the token store. */
export default function App() {
  const { t } = useTranslation();
  const { status, error, retry, signIn, signOut, refreshAccess, hasScope } = useAuth();
  const config = usePortalConfig();

  if (status === 'loading') return <Splash />;
  if (status === 'signedOut')
    return (
      <StatusPage
        title={t('shell.signedOut.title')}
        description={t('shell.signedOut.description')}
        actions={
          <Button variant="contained" onClick={signIn}>
            {t('common.actions.signIn')}
          </Button>
        }
      />
    );
  if (status === 'error')
    return (
      <StatusPage
        title={t('shell.sessionError.title')}
        description={error?.message ?? t('shell.sessionError.description')}
        actions={
          <>
            <Button variant="outlined" onClick={retry}>
              {t('common.actions.retry')}
            </Button>
            <Button variant="contained" onClick={signIn}>
              {t('shell.sessionError.signInAgain')}
            </Button>
          </>
        }
      />
    );

  // Every page needs one of the view scopes, so without any the shell would be empty.
  if (!Object.values(VIEW_SCOPES).some(hasScope))
    return (
      <StatusPage
        title={t('shell.noAccess.title', { portal: config.portalName })}
        description={t('shell.noAccess.description', { portal: config.portalName })}
        actions={
          <>
            <Button variant="outlined" onClick={() => void signOut()}>
              {t('common.actions.signOut')}
            </Button>
            <Button variant="contained" onClick={refreshAccess}>
              {t('shell.noAccess.checkAgain')}
            </Button>
          </>
        }
      />
    );

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path={KIND_SEGMENTS.aiAgent} element={<IntegrationsPage key="aiAgent" kind="aiAgent" />} />
        <Route path={KIND_SEGMENTS.automation} element={<IntegrationsPage key="automation" kind="automation" />} />
        <Route path={KIND_SEGMENTS.workflow} element={<IntegrationsPage key="workflow" kind="workflow" />} />
        <Route path="integrations/:id" element={<IntegrationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
