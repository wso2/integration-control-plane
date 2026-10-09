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

import { Box, Button, CircularProgress } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useCreateAlertRule, useUpdateAlertRule } from '../../../hooks/useAlerts';
import type { AlertRule } from '../../../../types/alerts';

interface AlertRuleFormActionsProps {
  isEditAlertRule: boolean;
  isDisabled: boolean;
  validateForm: () => AlertRule | null;
  cleanUpForm: () => void;
  goBackToAlertRules: () => void;
  setSelectedAlertTypeEnvVersion: (alertType: string, environmentId: string) => void;
  alertingBaseUrl: string;
  onNotify?: (message: string, severity: 'success' | 'error') => void;
}

export default function AlertRuleFormActions(props: AlertRuleFormActionsProps): JSX.Element {
  const { isEditAlertRule, isDisabled, validateForm, cleanUpForm, goBackToAlertRules, setSelectedAlertTypeEnvVersion, alertingBaseUrl, onNotify } = props;

  const createMutation = useCreateAlertRule(alertingBaseUrl);
  const { updateAlertRuleMutation, isUpdateAlertRuleLoading } = useUpdateAlertRule(alertingBaseUrl);

  const isLoading = createMutation.isPending || isUpdateAlertRuleLoading;

  const handleSave = async () => {
    const alertRule = validateForm();
    if (!alertRule) return;
    try {
      if (isEditAlertRule) {
        await updateAlertRuleMutation(alertRule);
        onNotify?.('Alert rule updated successfully', 'success');
      } else {
        await createMutation.mutateAsync(alertRule);
        onNotify?.('Alert rule created successfully', 'success');
      }
      setSelectedAlertTypeEnvVersion(alertRule.type, alertRule.environmentId);
      cleanUpForm();
      goBackToAlertRules();
    } catch {
      if (isEditAlertRule) {
        onNotify?.('Failed to update alert rule', 'error');
      } else {
        onNotify?.('Failed to create the alert rule', 'error');
      }
    }
  };

  const handleCancel = () => {
    cleanUpForm();
    goBackToAlertRules();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, mt: 2 }}>
      <Button variant="outlined" onClick={handleCancel} disabled={isLoading}>
        {isEditAlertRule ? 'Discard' : 'Cancel'}
      </Button>
      <Button variant="contained" color="primary" onClick={handleSave} disabled={isDisabled || isLoading} startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}>
        {isLoading ? (isEditAlertRule ? 'Updating...' : 'Creating...') : isEditAlertRule ? 'Update' : 'Create'}
      </Button>
    </Box>
  );
}
