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

import { Grid, PageContent, PageTitle } from '@wso2/oxygen-ui';
import { useMemo, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useProjectCompliance, usePolicyAdherence } from '../hooks/useGovernance';
import { useProjectsByOrg } from '../../hooks/useProjects';
import { projectComplianceUrl, orgGovernancePolicyEditorUrl, orgGovernanceRulesetUrl } from '../../paths';
import type { OrgScope } from '../../nav';
import type { ComplianceRow } from '../../types/compliance';
import { adherenceEntryToRow, adherenceSlices, buildPolicyTypeMap, complianceEntryToRow, complianceSlices } from '../utils/compliance';
import CompliancePie from '../components/Compliance/CompliancePie';
import ExpandableComplianceTable from '../components/Compliance/ExpandableComplianceTable';

export default function OrgCompliance(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { data: projects } = useProjectsByOrg(scope.org);
  const compliance = useProjectCompliance();
  const adherence = usePolicyAdherence();

  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, { name: p.name, handler: p.handler }])), [projects]);

  const policyTypeMap = useMemo(() => buildPolicyTypeMap(adherence.data?.list ?? [], compliance.data?.list ?? []), [adherence.data, compliance.data]);

  const openProject = (projectId: string) => {
    const handler = projectMap.get(projectId)?.handler;
    if (handler) navigate(projectComplianceUrl(scope.org, handler));
  };

  const openPolicy = (policyId: string | null) => {
    if (policyId) navigate(orgGovernancePolicyEditorUrl(scope.org, policyId, policyTypeMap[policyId]));
  };

  const complianceRows = useMemo<ComplianceRow[]>(() => (compliance.data?.list ?? []).map((e) => complianceEntryToRow(e, e.projectId, projectMap.get(e.projectId)?.name ?? e.projectName)), [compliance.data, projectMap]);

  const adherenceRows = useMemo<ComplianceRow[]>(
    () =>
      (adherence.data?.list ?? []).map((e) =>
        adherenceEntryToRow(
          e,
          e.projects,
          (e.projects?.list ?? []).map((p) => ({
            id: p.projectId,
            name: projectMap.get(p.projectId)?.name ?? p.projectName,
            status: p.status,
          })),
        ),
      ),
    [adherence.data, projectMap],
  );

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>API Compliance</PageTitle.Header>
      </PageTitle>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <CompliancePie title="Project Compliance" count={compliance.data?.summary.project.total ?? 0} slices={complianceSlices(compliance.data?.summary.project)} isLoading={compliance.isLoading} />
        </Grid>
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
            nameLabel="Projects"
            infoLabel="Policies"
            failedWord="Violated"
            nestedNameLabel="Policy"
            nestedInfoLabel="Rulesets"
            rows={complianceRows}
            isLoading={compliance.isLoading}
            error={compliance.isError}
            onRetry={() => void compliance.refetch()}
            onRowClick={(row) => openProject(row.id)}
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
            infoLabel="Projects"
            failedWord="Non-Compliant"
            nestedNameLabel="Projects"
            rows={adherenceRows}
            isLoading={adherence.isLoading}
            error={adherence.isError}
            onRetry={() => void adherence.refetch()}
            onRowClick={(row) => openPolicy(row.id)}
            onItemClick={(_, item) => {
              if (item.id) openProject(item.id);
            }}
          />
        </Grid>
      </Grid>
    </PageContent>
  );
}
