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

import { Autocomplete, Box, Button, Grid, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { type JSX, useEffect, useState } from 'react';
import type { Environment } from '../../../types/environment';
import type { AlertRule, AlertRuleFormProps, AlertTypeOption } from '../../../types/alerts';
import { ALERTS_CREATE_NEW_RULE_BACK_BUTTON_TEXT, ALERTS_CREATE_NEW_RULE_TITLE, ALERTS_EDIT_RULE_TITLE, AlertTypeConstants } from '../../../constants/alerts';
import { getAlertTypeOptionByValue, getAlertTypeOptions } from '../../utils/alerts';
import AlertRuleDiscardDialog from './AlertRuleDialogs/AlertRuleDiscardDialog';
import LatencyAlertRuleForm from './AlertRuleForms/LatencyAlertRuleForm';
import TrafficAlertRuleForm from './AlertRuleForms/TrafficAlertRuleForm';
import StatusCodeAlertRuleForm from './AlertRuleForms/StatusCodeAlertRuleForm';
import ResourceAlertRuleForm from './AlertRuleForms/ResourceAlertRuleForm';
import LogsAlertRuleForm from './AlertRuleForms/LogsAlertRuleForm';
import BuildAlertRuleForm from './AlertRuleForms/BuildAlertRuleForm';

interface CreateAlertRuleProps {
  goBackToAlertRules: () => void;
  environments: Environment[];
  selectedEnvironment: Environment;
  setSelectedEnvironment: (env: Environment) => void;
  selectedAlertType: AlertTypeOption;
  setSelectedAlertType: (type: AlertTypeOption) => void;
  componentId: string;
  projectId: string;
  versionId: string;
  versionName: string;
  isProxy: boolean;
  hasPublicOrOrgVisibility: boolean;
  projectName: string;
  isEditAlertRule?: boolean;
  selectedAlertRule?: AlertRule;
  buildAlertRules: AlertRule[];
  alertingBaseUrl: string;
  onNotify?: (message: string, severity: 'success' | 'error') => void;
}

const FORM_MAP: Record<AlertTypeConstants, React.ComponentType<AlertRuleFormProps>> = {
  [AlertTypeConstants.LATENCY]: LatencyAlertRuleForm,
  [AlertTypeConstants.TRAFFIC]: TrafficAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.RESOURCES]: ResourceAlertRuleForm,
  [AlertTypeConstants.LOGS]: LogsAlertRuleForm,
  [AlertTypeConstants.BUILD]: BuildAlertRuleForm,
  // sub-types are not direct form keys; they appear only in metrics dropdowns
  [AlertTypeConstants.LATENCY_99TH_PERCENTILE]: LatencyAlertRuleForm,
  [AlertTypeConstants.LATENCY_95TH_PERCENTILE]: LatencyAlertRuleForm,
  [AlertTypeConstants.LATENCY_90TH_PERCENTILE]: LatencyAlertRuleForm,
  [AlertTypeConstants.LATENCY_50TH_PERCENTILE]: LatencyAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_400]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_401]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_403]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_404]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_429]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_500]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_502]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_503]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_4XX]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.STATUS_CODE_5XX]: StatusCodeAlertRuleForm,
  [AlertTypeConstants.RESOURCES_CPU]: ResourceAlertRuleForm,
  [AlertTypeConstants.RESOURCES_MEMORY]: ResourceAlertRuleForm,
};

export default function CreateAlertRule(props: CreateAlertRuleProps): JSX.Element {
  const {
    goBackToAlertRules,
    environments,
    selectedEnvironment,
    setSelectedEnvironment,
    selectedAlertType,
    setSelectedAlertType,
    componentId,
    projectId,
    versionId,
    versionName,
    isProxy,
    hasPublicOrOrgVisibility,
    projectName,
    isEditAlertRule = false,
    selectedAlertRule,
    buildAlertRules,
    alertingBaseUrl,
    onNotify,
  } = props;

  const [alertType, setAlertType] = useState<AlertTypeOption>(selectedAlertType);
  const [environment, setEnvironment] = useState<Environment>(selectedEnvironment);
  const [isAlertRuleHalfConfigured, setIsAlertRuleHalfConfigured] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingAlertType, setPendingAlertType] = useState<AlertTypeOption | null>(null);

  const alertTypeOptions = getAlertTypeOptions(isProxy);

  const isStatusCodeDisabled = !isProxy && !hasPublicOrOrgVisibility;

  useEffect(() => {
    if (alertType.value === AlertTypeConstants.STATUS_CODE && isStatusCodeDisabled && !isEditAlertRule) {
      setAlertType({ label: alertTypeOptions[0].label, value: alertTypeOptions[0].value });
    }
  }, [alertType.value, alertTypeOptions, isEditAlertRule, isStatusCodeDisabled]);

  const handleAlertTypeChange = (_: unknown, v: AlertTypeOption | null) => {
    if (!v) return;
    if (isAlertRuleHalfConfigured) {
      setPendingAlertType(v);
      setShowDiscardDialog(true);
    } else {
      setAlertType(v);
    }
  };

  const handleDiscardConfirm = () => {
    setShowDiscardDialog(false);
    setIsAlertRuleHalfConfigured(false);
    if (pendingAlertType) {
      setAlertType(pendingAlertType);
      setPendingAlertType(null);
    }
  };

  const setSelectedAlertTypeEnvVersion = (type: string, environmentId: string) => {
    const option = getAlertTypeOptionByValue(type as AlertTypeConstants);
    if (option) setSelectedAlertType(option as AlertTypeOption);
    const env = environments.find((e) => e.id === environmentId);
    if (env) setSelectedEnvironment(env);
  };

  const FormComponent = FORM_MAP[alertType.value];
  const title = isEditAlertRule ? ALERTS_EDIT_RULE_TITLE.replace('{alertType}', alertType.label) : ALERTS_CREATE_NEW_RULE_TITLE.replace('{alertType}', alertType.label);

  return (
    <Box sx={{ p: 1 }}>
      <AlertRuleDiscardDialog
        isOpen={showDiscardDialog}
        alertType={alertType.label}
        handleClose={() => {
          setShowDiscardDialog(false);
          setPendingAlertType(null);
        }}
        handleConfirm={handleDiscardConfirm}
        isLoading={false}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, mt: -2 }}>
        <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={goBackToAlertRules}>
          {ALERTS_CREATE_NEW_RULE_BACK_BUTTON_TEXT}
        </Button>
      </Box>

      <Typography variant="h5" sx={{ mb: 5 }}>
        {title}
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Autocomplete
            options={alertTypeOptions}
            getOptionLabel={(o) => o.label}
            value={alertType}
            onChange={handleAlertTypeChange}
            disabled={isEditAlertRule}
            getOptionDisabled={(o) => o.value === AlertTypeConstants.STATUS_CODE && isStatusCodeDisabled}
            renderInput={(params) => <TextField {...params} label="Alert Type" size="small" />}
            isOptionEqualToValue={(o, v) => o.value === v.value}
          />
        </Grid>
        {alertType.value !== AlertTypeConstants.BUILD && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Autocomplete
              options={environments}
              getOptionLabel={(e) => e.name}
              value={environment}
              onChange={(_, v) => {
                if (v) {
                  setEnvironment(v);
                  setSelectedEnvironment(v);
                }
              }}
              disabled={isEditAlertRule}
              renderInput={(params) => <TextField {...params} label="Environment" size="small" />}
              isOptionEqualToValue={(o, v) => o.id === v.id}
            />
          </Grid>
        )}
      </Grid>

      {FormComponent && (
        <FormComponent
          environment={environment}
          componentId={componentId}
          projectId={projectId}
          versionId={versionId}
          versionName={versionName}
          isProxy={isProxy}
          hasPublicOrOrgVisibility={hasPublicOrOrgVisibility}
          projectName={projectName}
          environmentName={environment.name}
          selectedAlertRule={selectedAlertRule}
          isEditAlertRule={isEditAlertRule}
          goBackToAlertRules={goBackToAlertRules}
          setSelectedAlertTypeEnvVersion={setSelectedAlertTypeEnvVersion}
          setIsAlertRuleHalfConfigured={setIsAlertRuleHalfConfigured}
          buildAlertRules={buildAlertRules}
          alertingBaseUrl={alertingBaseUrl}
          onNotify={onNotify}
        />
      )}
    </Box>
  );
}
