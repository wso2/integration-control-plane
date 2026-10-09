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

import { Alert, Box, CircularProgress, Grid, MenuItem, PageContent, PageTitle, Select } from '@wso2/oxygen-ui';
import { useMemo, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useEndpointRuleAdherence, useEndpointPolicyAdherence, useEndpointRulesetAdherence, usePolicies } from '../hooks/useGovernance';
import { useProjectId } from '../../hooks/useProjects';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useEndpointSelection } from '../hooks/useEndpointSelection';
import { useIntegrationIdentity } from '../../hooks/useIntegrationIdentity';
import { orgGovernancePolicyEditorUrl, orgGovernanceRulesetUrl } from '../../paths';
import type { ComponentScope } from '../../nav';
import { STANDALONE_RULESET_LABEL, STANDALONE_RULESET_ROW_ID } from '../constants/compliance';
import type { ComplianceRow } from '../../types/compliance';
import { adherenceSlices, countViolated } from '../utils/compliance';
import DeploymentTrackBar from '../../components/DeploymentTrackBar';
import ComingSoon from '../../pages/ComingSoon';
import CompliancePie from '../components/Compliance/CompliancePie';
import ExpandableComplianceTable from '../components/Compliance/ExpandableComplianceTable';
import RuleViolationsTabs from '../components/Compliance/RuleViolationsTabs';
import RulesetsAdherenceSummaryCard from '../components/Compliance/RulesetsAdherenceSummaryCard';
import { PILL_SELECT_SX } from '../../constants/styles';

export default function ComponentCompliance(scope: ComponentScope): JSX.Element {
  const navigate = useAppNavigate();
  const { projectId, isLoading: loadingProject } = useProjectId(scope.project);
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const identity = useIntegrationIdentity(component);
  const { tracks, selectedTrackId, setSelectedTrackId, loadingEndpoints, selectedApimId, setSelectedApimId, endpointsWithApim } = useEndpointSelection(component);

  const ruleDetails = useEndpointRuleAdherence(projectId, component?.id ?? '', selectedApimId ?? '');
  const policyAdherence = useEndpointPolicyAdherence(projectId, component?.id ?? '', selectedApimId ?? '');
  const rulesetAdherence = useEndpointRulesetAdherence(projectId, component?.id ?? '', selectedApimId ?? '');

  // The endpoint-level response omits policyType, so resolve it from the org policy list.
  const { data: orgPolicies, isLoading: loadingPolicies } = usePolicies();
  const openPolicy = (policyId: string | null) => {
    if (!policyId) return;
    const policyType = orgPolicies?.list.find((p) => p.id === policyId)?.policyType;
    navigate(orgGovernancePolicyEditorUrl(scope.org, policyId, policyType));
  };

  const isLoading = loadingProject || loadingComponent || loadingPolicies || (tracks.length > 0 && !selectedTrackId) || loadingEndpoints || (endpointsWithApim.length > 0 && !selectedApimId);

  const policyRows = useMemo<ComplianceRow[]>(
    () =>
      (policyAdherence.data?.list ?? []).map((e) => ({
        id: e.policyId ?? STANDALONE_RULESET_ROW_ID,
        name: e.policyName ?? STANDALONE_RULESET_LABEL,
        status: e.status,
        failed: countViolated(e.rulesets?.list ?? []),
        total: e.rulesets?.count ?? 0,
        searchText: JSON.stringify(e),
        items: (e.rulesets?.list ?? []).map((r) => ({
          id: r.rulesetId,
          name: r.rulesetName,
          status: r.status,
          violations: r.ruleViolations,
        })),
      })),
    [policyAdherence.data],
  );

  // API compliance evaluates a published API definition; automations expose none.
  if (identity?.type === 'automation') {
    return <ComingSoon title="Not Available" description="API Compliance is not available for Automations." />;
  }

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', flex: 1 }}>
      <DeploymentTrackBar
        tracks={tracks}
        selectedId={selectedTrackId}
        onChange={setSelectedTrackId}
        orgHandler={scope.org}
        projectHandler={scope.project}
        componentHandler={scope.component}
        versionView
        extra={
          endpointsWithApim.length > 0 && (
            <Select size="small" value={selectedApimId ?? ''} onChange={(e) => setSelectedApimId(e.target.value as string)} disabled={endpointsWithApim.length <= 1} sx={{ ...PILL_SELECT_SX, minWidth: 140 }}>
              {endpointsWithApim.map((ep) => (
                <MenuItem key={ep.apimId!} value={ep.apimId!}>
                  {ep.displayName}
                </MenuItem>
              ))}
            </Select>
          )
        }
      />

      <PageContent>
        <PageTitle>
          <PageTitle.Header>API Compliance</PageTitle.Header>
        </PageTitle>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : endpointsWithApim.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Endpoints are not available for the selected Deployment Track. Please try selecting a different Deployment Track.
          </Alert>
        ) : (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <RuleViolationsTabs data={ruleDetails.data} isLoading={ruleDetails.isLoading} error={ruleDetails.isError} onRetry={() => void ruleDetails.refetch()} />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <ExpandableComplianceTable
                title="Policy Adherence Summary"
                nameLabel="Policy"
                infoLabel="Ruleset Summary"
                failedWord="Violated"
                nestedNameLabel="Rulesets"
                rows={policyRows}
                isLoading={policyAdherence.isLoading}
                error={policyAdherence.isError}
                onRetry={() => void policyAdherence.refetch()}
                onRowClick={(row) => {
                  if (row.id !== STANDALONE_RULESET_ROW_ID) openPolicy(row.id);
                }}
                onItemClick={(_, item) => {
                  if (item.id) navigate(orgGovernanceRulesetUrl(scope.org, item.id));
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <CompliancePie title="Ruleset Adherence" count={rulesetAdherence.data?.summary.ruleset.total ?? 0} slices={adherenceSlices(rulesetAdherence.data?.summary.ruleset)} isLoading={rulesetAdherence.isLoading} />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 8 }}>
              <RulesetsAdherenceSummaryCard data={ruleDetails.data} isLoading={ruleDetails.isLoading} error={ruleDetails.isError} onRetry={() => void ruleDetails.refetch()} onRulesetClick={(id) => navigate(orgGovernanceRulesetUrl(scope.org, id))} />
            </Grid>
          </Grid>
        )}
      </PageContent>
    </Box>
  );
}
