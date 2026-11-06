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

import { Alert, Box, PageContent, PageTitle } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import EnvironmentSelect from '../components/common/EnvironmentSelect';
import ContainerCardSkeleton from '../components/Containers/ContainerCardSkeleton';
import ContainerInfoCard from '../components/Containers/ContainerInfoCard';
import { useAccessControl } from '../contexts/AccessControlContext';
import { Scopes } from '../constants/permissions';
import { BILLING_PRODUCT_CODE } from '../constants/subscription';
import { useBillingOrg, useBillingPlan } from '../hooks/useBillingOrg';
import { useRelease } from '../hooks/useDevopsConfigs';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { useSelectedTrack } from '../hooks/useSelectedTrack';
import { isPaidPlan, type PlanAccess } from '../utils/billing';
import type { ComponentScope } from '../nav';

export default function ComponentContainers({ org, project, component }: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid();
  const { projectId } = useProjectId(project);
  const { hasPermission } = useAccessControl();
  const { data: comp, isLoading } = useComponentByHandler(projectId, component);
  const canManage = hasPermission(Scopes.INTEGRATION_UPDATE, projectId, comp?.id);

  const { tracks, trackId } = useSelectedTrack(comp);

  const { data: environments = [] } = useEnvironments(org, projectId);
  const [envId, setEnvId] = useState('');
  useEffect(() => {
    if (environments.length) setEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : environments[0].id));
  }, [environments]);

  const { data: deployment } = useComponentDeployment(org, orgUuid ?? '', comp?.id ?? '', trackId, envId);
  const releaseId = deployment?.releaseId ?? '';
  const { data: release, isLoading: loadingRelease } = useRelease(projectId, comp?.id, releaseId, trackId);

  // Changing CPU and memory is a paid feature, and ipaas-service refuses it on other plans. The plan
  // summary on the billing org carries no type, so the plan itself is read for whether it is paid.
  const billingOrgRead = useBillingOrg(BILLING_PRODUCT_CODE);
  const billingPlanRead = useBillingPlan(billingOrgRead.org?.subscription?.plan?.code);
  const loadingPlan = billingOrgRead.isLoading || billingPlanRead.isLoading;
  // A failed read is not a free plan: the sizes stay locked, but the user is told why and can retry.
  // The plan is read only once the org is, so an org failure is retried first.
  const planAccess: PlanAccess =
    billingOrgRead.isError || billingPlanRead.isError ? { state: 'unavailable', retry: billingOrgRead.isError ? billingOrgRead.refetch : billingPlanRead.refetch } : { state: isPaidPlan(billingOrgRead.org, billingPlanRead.plan) ? 'paid' : 'free' };

  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => setAlert(null), [trackId, envId]);

  const containers = release?.containers ?? [];

  const envSelect = environments.length > 1 ? <EnvironmentSelect environments={environments} value={envId} onChange={setEnvId} deployment={{ orgHandler: org, orgUuid: orgUuid ?? '', componentId: comp?.id ?? '', versionId: trackId }} /> : null;

  return (
    <Box>
      {tracks.length > 0 && <DeploymentTrackBar component={comp} extra={envSelect} />}
      <PageContent fullWidth>
        <PageTitle>
          <PageTitle.Header>Containers</PageTitle.Header>
        </PageTitle>

        {alert && (
          <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
            {alert.message}
          </Alert>
        )}

        {isLoading || loadingPlan || (loadingRelease && !!releaseId) ? (
          <ContainerCardSkeleton />
        ) : !comp ? (
          <Alert severity="error">Integration not found</Alert>
        ) : trackId === undefined ? null : containers.length === 0 ? (
          <Alert severity="info">This integration has no containers in the selected environment yet. Deploy it to configure its containers.</Alert>
        ) : (
          containers.map((c) => (
            <ContainerInfoCard
              key={`${trackId}/${c.ID}`}
              container={c}
              projectId={projectId}
              componentId={comp.id}
              releaseId={releaseId}
              deploymentTrackId={trackId}
              plan={planAccess}
              canManage={canManage}
              onSaved={(message) => setAlert({ type: 'success', message })}
              onError={(message) => setAlert({ type: 'error', message })}
            />
          ))
        )}
      </PageContent>
    </Box>
  );
}
