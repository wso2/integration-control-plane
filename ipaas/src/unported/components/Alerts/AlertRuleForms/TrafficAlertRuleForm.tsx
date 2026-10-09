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

import { Alert, Autocomplete, Box, Collapse, Grid, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { ChevronDown, ChevronUp } from '@wso2/oxygen-ui-icons-react';
import { type JSX, useEffect, useState } from 'react';
import {
  ALERT_CREATE_NEW_RULE_ADVANCED_TITLE,
  ALERT_RULE_THRESHOLD_MAX,
  ALERT_RULE_THRESHOLD_MIN,
  AlertComponentType,
  AlertRulePeriodConstants,
  AlertTypeConstants,
  AlertTypes,
  type AlertRulePeriodOption,
  type AlertRulePeriod,
} from '../../../../constants/alerts';
import { alertRuleConfigErrorMessages, getAlertPeriodOptions, getAlertRuleExplanation } from '../../../utils/alerts';
import type { AlertRule, AlertRuleFormProps } from '../../../../types/alerts';
import AlertRuleFormActions from './AlertRuleFormActions';
import EmailTagInput from '../../EmailTagInput';

export default function TrafficAlertRuleForm(props: AlertRuleFormProps): JSX.Element {
  const { environment, componentId, projectId, versionId, versionName, projectName, environmentName, selectedAlertRule, isEditAlertRule, goBackToAlertRules, setSelectedAlertTypeEnvVersion, setIsAlertRuleHalfConfigured, alertingBaseUrl, onNotify } = props;

  const [isCollapseOpen, setIsCollapseOpen] = useState(false);
  const alertRule: AlertRule =
    selectedAlertRule ||
    ({
      projectId,
      componentId,
      environmentId: environment.id,
      versionId,
      componentType: AlertComponentType.SERVICE,
      projectName,
      environmentName,
      versionName: versionName,
      id: '',
      type: AlertTypeConstants.TRAFFIC,
      threshold: null,
      emails: [],
      period: AlertRulePeriodConstants.FIVE_MINUTES,
      enabled: true,
    } as AlertRule);

  const [threshold, setThreshold] = useState<number | null>(selectedAlertRule?.threshold ?? null);
  const [period, setPeriod] = useState<AlertRulePeriodOption>(selectedAlertRule?.period ? (getAlertPeriodOptions().find((o) => o.value === selectedAlertRule.period) ?? getAlertPeriodOptions()[0]) : getAlertPeriodOptions()[0]);
  const [emailList, setEmailList] = useState<string[]>(selectedAlertRule?.emails ?? []);
  const [errorThreshold, setErrorThreshold] = useState('');

  useEffect(() => {
    setIsAlertRuleHalfConfigured(false);
  }, [setIsAlertRuleHalfConfigured]);

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    if (Number.isNaN(Number(value)) || Number(value) < ALERT_RULE_THRESHOLD_MIN || Number(value) > ALERT_RULE_THRESHOLD_MAX) {
      setErrorThreshold(alertRuleConfigErrorMessages.threshold);
      setThreshold(null);
      return;
    }
    setErrorThreshold('');
    setThreshold(Number(value));
    setIsAlertRuleHalfConfigured(true);
  };

  const cleanup = () => {
    setThreshold(null);
    setPeriod(getAlertPeriodOptions()[0]);
    setEmailList([]);
    setErrorThreshold('');
    setIsAlertRuleHalfConfigured(false);
  };

  const validate = (): AlertRule | null => {
    setErrorThreshold('');
    let valid = true;
    if (emailList.length === 0) valid = false;
    if (!threshold || threshold < ALERT_RULE_THRESHOLD_MIN || threshold > ALERT_RULE_THRESHOLD_MAX) {
      setErrorThreshold(alertRuleConfigErrorMessages.threshold);
      valid = false;
    }
    if (!valid) return null;
    Object.assign(alertRule, { threshold, period: period.value, emails: emailList });
    return alertRule;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2, '& .MuiFormLabel-asterisk': { color: 'error.main' } }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField required label="Threshold (requests per minute)" placeholder="Enter threshold" size="small" fullWidth value={threshold ?? ''} onChange={handleThresholdChange} error={!!errorThreshold} helperText={errorThreshold} />
        </Grid>
      </Grid>
      <Grid container spacing={3} sx={{ mt: -1 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <EmailTagInput
            required
            label="Emails"
            placeholder="Add email and press Enter"
            value={emailList}
            onChange={(emails) => {
              setEmailList(emails);
              setIsAlertRuleHalfConfigured(true);
            }}
          />
        </Grid>
      </Grid>

      <Box>
        <Box component="button" onClick={() => setIsCollapseOpen(!isCollapseOpen)} sx={{ display: 'flex', alignItems: 'center', gap: 1, background: 'none', border: 'none', cursor: 'pointer', p: 0, color: 'primary.main' }}>
          <Typography variant="body2" color="primary" fontWeight={500}>
            {ALERT_CREATE_NEW_RULE_ADVANCED_TITLE}
          </Typography>
          {isCollapseOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </Box>
        <Collapse in={isCollapseOpen}>
          <Grid container spacing={3} sx={{ mt: 3 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Autocomplete
                options={getAlertPeriodOptions()}
                getOptionLabel={(o) => o.label}
                value={period}
                onChange={(_, v) => {
                  if (v) {
                    setPeriod(v);
                    setIsAlertRuleHalfConfigured(true);
                  }
                }}
                renderInput={(params) => <TextField {...params} label="Period" placeholder="Select period" size="small" />}
                isOptionEqualToValue={(o, v) => o.value === v.value}
              />
            </Grid>
          </Grid>
        </Collapse>
      </Box>

      <Alert severity="info" variant="outlined">
        {getAlertRuleExplanation(AlertTypes.TRAFFIC, undefined, threshold, period.label as AlertRulePeriod)}
      </Alert>

      <AlertRuleFormActions
        isEditAlertRule={isEditAlertRule}
        isDisabled={!emailList.length || !threshold}
        validateForm={validate}
        cleanUpForm={cleanup}
        goBackToAlertRules={goBackToAlertRules}
        setSelectedAlertTypeEnvVersion={setSelectedAlertTypeEnvVersion}
        alertingBaseUrl={alertingBaseUrl}
        onNotify={onNotify}
      />
    </Box>
  );
}
