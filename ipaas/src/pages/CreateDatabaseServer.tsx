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

import { Alert, Button, PageContent } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import CreateServiceWizard from '../components/Databases/CreateServiceWizard';
import { DatabasePlansSkeleton } from '../components/Databases/DatabaseSkeletons';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useDatabaseAvailability } from '../hooks/useDatabases';
import { orgDatabasesUrl, type OrgScope } from '../nav';
import { PLATFORM_SERVICE_TYPES } from '../constants/databases';

export default function CreateDatabaseServer(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const [params] = useSearchParams();
  // An unknown ?type= falls back to the service step rather than failing the page.
  const initialKind = PLATFORM_SERVICE_TYPES.find((t) => t.id === params.get('type'))?.id;
  // Reachable by URL too, so the page checks availability itself rather than trusting the page that linked here.
  const availability = useDatabaseAvailability();
  const leave = () => navigate(orgDatabasesUrl(scope));

  const backButton = (
    <Button startIcon={<ArrowLeft size={16} />} onClick={leave} sx={{ mb: 2 }}>
      Back to Platform Services
    </Button>
  );

  if (availability.isLoading)
    return (
      <PageContent fullWidth>
        {backButton}
        <DatabasePlansSkeleton />
      </PageContent>
    );
  if (availability.isError)
    return (
      <PageContent fullWidth>
        {backButton}
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => availability.refetch()}>
              Retry
            </Button>
          }>
          Could not check whether platform services are available.
        </Alert>
      </PageContent>
    );
  if (availability.data?.available !== true)
    return (
      <PageContent fullWidth>
        {backButton}
        <Alert severity="info">Platform services are not available in this environment.</Alert>
      </PageContent>
    );

  return (
    <PageContent fullWidth>
      <CreateServiceWizard scope={scope} initialKind={initialKind} onCancel={leave} />
    </PageContent>
  );
}
