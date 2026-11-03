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

import { Button } from '@wso2/oxygen-ui';
import { useTranslation } from 'react-i18next';
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
