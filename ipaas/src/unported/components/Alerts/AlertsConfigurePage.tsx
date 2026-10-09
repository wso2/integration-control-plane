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

import { Alert, Autocomplete, Box, Button, CircularProgress, Tab, Tabs, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Plus } from '@wso2/oxygen-ui-icons-react';
import { type JSX, useEffect, useMemo, useState } from 'react';
import type { CloudDataPlane, Environment } from '../../../types/environment';
import { choreoAlertingApiUrl } from '../../../config/runtimeConfig';
import { IS_CLOUD } from '../../../features';
import { useDeleteAlertRule, useGetAlertRules, useGetAlertRulesCount, useUpdateAlertRule } from '../../hooks/useAlerts';
import type { AlertRule, AlertTypeOption } from '../../../types/alerts';
import { ALERTS_CREATE_NEW_RULE_BUTTON_TEXT, AlertComponentType, AlertTypeConstants, AlertTypes } from '../../../constants/alerts';
import { getAlertTypeOptionByValue, getAlertTypesTabItems } from '../../utils/alerts';
import AlertRuleDeleteDialog from './AlertRuleDialogs/AlertRuleDeleteDialog';
import AlertRuleToggleDialog from './AlertRuleDialogs/AlertRuleToggleDialog';
import AlertRuleList from './AlertRuleList';
import CreateAlertRule from './CreateAlertRule';

interface AlertsConfigurePageProps {
  componentId: string;
  projectId: string;
  projectName: string;
  versionId: string;
  versionName: string;
  isProxy: boolean;
  hasPublicOrOrgVisibility: boolean;
  environments: Environment[];
  cloudDataPlanes: CloudDataPlane[];
}

export default function AlertsConfigurePage(props: AlertsConfigurePageProps): JSX.Element {
  const { componentId, projectId, projectName, versionId, versionName, isProxy, hasPublicOrOrgVisibility, environments, cloudDataPlanes } = props;

  const componentType = isProxy ? AlertComponentType.API_PROXY : AlertComponentType.SERVICE;

  const [notification, setNotification] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const handleNotify = (message: string, severity: 'success' | 'error') => setNotification({ message, severity });

  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedAlertType, setSelectedAlertType] = useState<AlertTypeOption>({
    label: AlertTypes.LATENCY,
    value: AlertTypeConstants.LATENCY,
  });
  const [selectedAlertRule, setSelectedAlertRule] = useState<AlertRule | undefined>();
  const [createNewRule, setCreateNewRule] = useState(false);
  const [isEditAlertRule, setIsEditAlertRule] = useState(false);
  const [isDeleteAlertRule, setIsDeleteAlertRule] = useState(false);
  const [isToggleAlertRule, setIsToggleAlertRule] = useState(false);

  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment>(environments[0]);

  const alertingBaseUrl = useMemo(() => {
    if (IS_CLOUD) return '';
    if (!selectedEnvironment?.dpId || !cloudDataPlanes.length) return '';
    const cdp = cloudDataPlanes.find((c) => c.id.toLowerCase() === selectedEnvironment.dpId!.toLowerCase());
    return cdp ? choreoAlertingApiUrl(cdp.external_gateway_virtual_host) : '';
  }, [selectedEnvironment?.dpId, cloudDataPlanes]);

  const { data: alertRulesResponse, isFetching: isAlertRulesFetching } = useGetAlertRules(alertingBaseUrl, componentId, selectedEnvironment?.id ?? '', componentType);
  const { data: alertRulesCountUsage, isFetching: isAlertRulesCountFetching } = useGetAlertRulesCount(alertingBaseUrl, componentId, selectedEnvironment?.id ?? '', componentType);

  const { deleteAlertRuleMutation, isDeleteAlertRuleLoading } = useDeleteAlertRule(alertingBaseUrl);
  const { updateAlertRuleMutation, isUpdateAlertRuleLoading } = useUpdateAlertRule(alertingBaseUrl);

  const tabItems = useMemo(() => getAlertTypesTabItems(), []);

  // Sync selected alert type when tab changes
  useEffect(() => {
    if (tabItems[selectedTab]) {
      setSelectedAlertType({
        label: tabItems[selectedTab].name as AlertTypes,
        value: tabItems[selectedTab].envId as AlertTypeConstants,
      });
      setSelectedAlertRule(undefined);
    }
  }, [selectedTab, tabItems]);

  // Pre-populate from URL query params (e.g., deep links from observability)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const type = searchParams.get('type') as AlertTypeConstants;
    if (type) {
      const option = getAlertTypeOptionByValue(type);
      if (option) {
        setSelectedAlertType(option as AlertTypeOption);
        setCreateNewRule(true);
      }
    }
  }, []);

  // Default first environment when environments list loads
  useEffect(() => {
    if (environments.length && !selectedEnvironment) {
      setSelectedEnvironment(environments[0]);
    }
  }, [environments, selectedEnvironment]);

  const handleCloseDialog = (type: 'delete' | 'toggle') => {
    setSelectedAlertRule(undefined);
    setCreateNewRule(false);
    setIsEditAlertRule(false);
    if (type === 'delete') setIsDeleteAlertRule(false);
    else setIsToggleAlertRule(false);
  };

  const handleOpenCreateRule = () => {
    setNotification(null);
    setCreateNewRule(true);
  };

  const handleConfirmDialog = async (type: 'delete' | 'toggle', rule: AlertRule | undefined) => {
    if (!rule) return;
    if (type === 'delete') {
      try {
        await deleteAlertRuleMutation(rule);
        handleNotify('Alert rule deleted successfully', 'success');
      } catch {
        handleNotify('Failed to delete alert rule', 'error');
      } finally {
        setIsDeleteAlertRule(false);
        setSelectedAlertRule(undefined);
      }
    } else {
      try {
        await updateAlertRuleMutation({ ...rule, enabled: !rule.enabled });
        handleNotify('Alert rule updated successfully', 'success');
      } catch {
        handleNotify('Failed to update alert rule', 'error');
      } finally {
        setIsToggleAlertRule(false);
        setSelectedAlertRule(undefined);
      }
    }
  };

  const isFetching = (isAlertRulesFetching || isAlertRulesCountFetching) && !createNewRule && !isEditAlertRule;
  // "Initial load" = first fetch, no prior data yet. "Refreshing" = re-fetch with stale data available.
  const hasData = alertRulesResponse !== undefined;
  const hasRules = (alertRulesResponse?.alertRulesCount ?? 0) > 0;
  const isInitialLoad = isFetching && !hasData;
  const isRefreshing = isFetching && hasData;

  const showEmptyState = !isFetching && !createNewRule && !isEditAlertRule && !hasRules;
  // Show the tab+list structure whenever rules are known to exist (keep tabs visible during refresh).
  const showList = selectedAlertType && !createNewRule && !isEditAlertRule && hasRules;

  const quotaExceeded = alertRulesCountUsage !== undefined && alertRulesCountUsage.max > 0 && alertRulesCountUsage.count >= alertRulesCountUsage.max;

  return (
    <>
      <AlertRuleDeleteDialog isOpen={isDeleteAlertRule} isLoading={isDeleteAlertRuleLoading} alertType={selectedAlertRule?.type} handleClose={() => handleCloseDialog('delete')} handleConfirm={() => handleConfirmDialog('delete', selectedAlertRule)} />
      <AlertRuleToggleDialog
        isOpen={isToggleAlertRule}
        isLoading={isUpdateAlertRuleLoading}
        alertType={selectedAlertRule?.type}
        isEnabled={selectedAlertRule?.enabled}
        handleClose={() => handleCloseDialog('toggle')}
        handleConfirm={() => handleConfirmDialog('toggle', selectedAlertRule)}
      />

      {!createNewRule && !isEditAlertRule && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">Filter by:</Typography>
            <Autocomplete
              options={environments}
              getOptionLabel={(e) => e.name}
              value={selectedEnvironment}
              onChange={(_, v) => {
                if (v) {
                  setSelectedEnvironment(v);
                  setSelectedAlertRule(undefined);
                }
              }}
              renderInput={(params) => <TextField {...params} size="small" label="Environment" />}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              sx={{ minWidth: 200 }}
              size="small"
            />
          </Box>
          {alertRulesResponse?.alertRulesCount !== undefined && alertRulesResponse.alertRulesCount > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {alertRulesCountUsage && alertRulesCountUsage.max > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {alertRulesCountUsage.count}/{alertRulesCountUsage.max} rules
                </Typography>
              )}
              <Button variant="contained" size="small" startIcon={<Plus size={14} />} onClick={handleOpenCreateRule} disabled={quotaExceeded}>
                {ALERTS_CREATE_NEW_RULE_BUTTON_TEXT}
              </Button>
            </Box>
          )}
        </Box>
      )}

      {(createNewRule || isEditAlertRule) && selectedAlertType && (
        <CreateAlertRule
          goBackToAlertRules={() => {
            setCreateNewRule(false);
            setIsEditAlertRule(false);
            setSelectedAlertRule(undefined);
          }}
          environments={environments}
          selectedEnvironment={selectedEnvironment}
          setSelectedEnvironment={setSelectedEnvironment}
          selectedAlertType={selectedAlertType}
          setSelectedAlertType={setSelectedAlertType}
          componentId={componentId}
          projectId={projectId}
          versionId={versionId}
          versionName={versionName}
          isProxy={isProxy}
          hasPublicOrOrgVisibility={hasPublicOrOrgVisibility}
          projectName={projectName}
          isEditAlertRule={isEditAlertRule}
          selectedAlertRule={selectedAlertRule}
          buildAlertRules={alertRulesResponse?.buildAlertRules ?? []}
          alertingBaseUrl={alertingBaseUrl}
          onNotify={handleNotify}
        />
      )}

      {!createNewRule && !isEditAlertRule && (
        <>
          {notification && (
            <Alert severity={notification.severity} onClose={() => setNotification(null)} sx={{ mx: 2, my: 2 }}>
              {notification.message}
            </Alert>
          )}
        </>
      )}

      {isInitialLoad && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {showEmptyState && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4, gap: 2 }}>
          <Typography variant="body1" color="text.secondary">
            No alert rules found.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create a new alert rule to get started.
          </Typography>
          <Button variant="contained" startIcon={<Plus size={14} />} onClick={handleOpenCreateRule} disabled={quotaExceeded}>
            {ALERTS_CREATE_NEW_RULE_BUTTON_TEXT}
          </Button>
          {quotaExceeded && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Alert rule quota reached ({alertRulesCountUsage?.count}/{alertRulesCountUsage?.max}). Delete existing rules to create new ones.
            </Alert>
          )}
        </Box>
      )}

      {showList && (
        <Box sx={{ px: 2 }}>
          <Tabs value={selectedTab} onChange={(_, v) => setSelectedTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            {tabItems.map((tab) => (
              <Tab key={tab.envId} label={tab.name} />
            ))}
          </Tabs>

          {isRefreshing ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {alertRulesResponse?.alertRules[selectedAlertType.value]?.length === 0 && (
                <Box sx={{ p: 2 }}>
                  <Typography color="text.secondary">No alert rules found for this alert type.</Typography>
                </Box>
              )}
              {(alertRulesResponse?.alertRules[selectedAlertType.value]?.length ?? 0) > 0 && (
                <AlertRuleList
                  alertType={selectedAlertType.value}
                  alertRules={alertRulesResponse?.alertRules[selectedAlertType.value] ?? []}
                  setIsEditAlertRule={setIsEditAlertRule}
                  setSelectedAlertRule={(rule) => {
                    setSelectedAlertRule(rule);
                    setCreateNewRule(false);
                  }}
                  setIsDeleteAlertRule={setIsDeleteAlertRule}
                  setIsToggleAlertRule={setIsToggleAlertRule}
                />
              )}
            </>
          )}
        </Box>
      )}
    </>
  );
}
