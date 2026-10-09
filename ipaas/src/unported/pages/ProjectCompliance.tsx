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

import { Box, CircularProgress, Grid, PageContent, PageTitle } from '@wso2/oxygen-ui';
import { useMemo, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useComponentCompliance, useProjectPolicyAdherence } from '../hooks/useGovernance';
import { useProjectId } from '../../hooks/useProjects';
import { useComponents } from '../../hooks/useComponents';
import { componentComplianceUrl, orgGovernancePolicyEditorUrl, orgGovernanceRulesetUrl } from '../../paths';
import type { ProjectScope } from '../../nav';
import type { ComplianceRow } from '../../types/compliance';
import { adherenceEntryToRow, adherenceSlices, buildPolicyTypeMap, complianceEntryToRow, complianceSlices } from '../utils/compliance';
import CompliancePie from '../components/Compliance/CompliancePie';
import ExpandableComplianceTable from '../components/Compliance/ExpandableComplianceTable';

export default function ProjectCompliance(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const { projectId, isLoading: loadingProject } = useProjectId(scope.project);
  const { data: components } = useComponents(scope.org, projectId);
  const compliance = useComponentCompliance(projectId);
  const adherence = useProjectPolicyAdherence(projectId);

  const componentMap = useMemo(() => new Map((components ?? []).map((c) => [c.id, { displayName: c.displayName, handler: c.handler }])), [components]);

  const policyTypeMap = useMemo(() => buildPolicyTypeMap(adherence.data?.list ?? [], compliance.data?.list ?? []), [adherence.data, compliance.data]);

  const openComponent = (componentId: string) => {
    const handler = componentMap.get(componentId)?.handler;
    if (handler) navigate(componentComplianceUrl(scope.org, scope.project, handler));
  };

  const openPolicy = (policyId: string | null) => {
    if (policyId) navigate(orgGovernancePolicyEditorUrl(scope.org, policyId, policyTypeMap[policyId]));
  };

  const complianceRows = useMemo<ComplianceRow[]>(() => (compliance.data?.list ?? []).map((e) => complianceEntryToRow(e, e.componentId, componentMap.get(e.componentId)?.displayName ?? e.componentName)), [compliance.data, componentMap]);

  const adherenceRows = useMemo<ComplianceRow[]>(
    () =>
      (adherence.data?.list ?? []).map((e) =>
        adherenceEntryToRow(
          e,
          e.components,
          (e.components?.list ?? []).map((c) => ({
            id: c.componentId,
            name: componentMap.get(c.componentId)?.displayName ?? c.componentName,
            status: c.status,
          })),
        ),
      ),
    [adherence.data, componentMap],
  );

  if (loadingProject) {
    return (
      <PageContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>API Compliance</PageTitle.Header>
      </PageTitle>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <CompliancePie title="Policy Adherence" count={adherence.data?.summary.policy.total ?? 0} slices={adherenceSlices(adherence.data?.summary.policy)} isLoading={adherence.isLoading} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <CompliancePie title="Component Compliance" count={compliance.data?.summary.component.total ?? 0} slices={complianceSlices(compliance.data?.summary.component)} isLoading={compliance.isLoading} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12 }}>
          <ExpandableComplianceTable
            title="Compliance Summary"
            nameLabel="Components"
            infoLabel="Policies"
            failedWord="Violated"
            nestedNameLabel="Policy"
            nestedInfoLabel="Rulesets"
            rows={complianceRows}
            isLoading={compliance.isLoading}
            error={compliance.isError}
            onRetry={() => void compliance.refetch()}
            onRowClick={(row) => openComponent(row.id)}
            onItemClick={(_, item) => openPolicy(item.id)}
            onSubItemClick={(_, __, sub) => {
              if (sub.id) navigate(orgGovernanceRulesetUrl(scope.org, sub.id));
            }}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <ExpandableComplianceTable
            title="Policy Adherence"
            nameLabel="Policy"
            infoLabel="Component"
            failedWord="Non-Compliant"
            nestedNameLabel="Component"
            rows={adherenceRows}
            isLoading={adherence.isLoading}
            error={adherence.isError}
            onRetry={() => void adherence.refetch()}
            onRowClick={(row) => openPolicy(row.id)}
            onItemClick={(_, item) => {
              if (item.id) openComponent(item.id);
            }}
          />
        </Grid>
      </Grid>
    </PageContent>
  );
}
