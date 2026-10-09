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
import { ALERT_CREATE_NEW_RULE_ADVANCED_TITLE, ALERT_RULE_THRESHOLD_MAX, ALERT_RULE_THRESHOLD_MIN, AlertComponentType, AlertTypeConstants, AlertTypes, type AlertRulePeriodOption, type AlertRulePeriod } from '../../../../constants/alerts';
import { alertRuleConfigErrorMessages, getAlertMetricOptions, getAlertPeriodOptions, getAlertRuleExplanation, getAlertRuleMetricNameByValue, getResourceThresholdUnit } from '../../../utils/alerts';
import type { AlertRule, AlertRuleFormProps, AlertTypeOption } from '../../../../types/alerts';
import AlertRuleFormActions from './AlertRuleFormActions';
import EmailTagInput from '../../EmailTagInput';

export default function ResourceAlertRuleForm(props: AlertRuleFormProps): JSX.Element {
  const { environment, componentId, projectId, versionId, versionName, projectName, environmentName, selectedAlertRule, isEditAlertRule, goBackToAlertRules, setSelectedAlertTypeEnvVersion, setIsAlertRuleHalfConfigured, alertingBaseUrl, onNotify } = props;

  const [isCollapseOpen, setIsCollapseOpen] = useState(false);
  const alertRule: AlertRule = selectedAlertRule
    ? { ...selectedAlertRule }
    : ({
        projectId,
        componentId,
        environmentId: environment.id,
        versionId,
        componentType: AlertComponentType.SERVICE,
        projectName,
        environmentName,
        versionName: versionName,
        id: '',
        type: AlertTypeConstants.RESOURCES,
        metric: null,
        threshold: null,
        emails: [],
        enabled: true,
      } as AlertRule);

  const resourceMetrics = getAlertMetricOptions(AlertTypeConstants.RESOURCES);

  const [metric, setMetric] = useState<AlertTypeOption | null>(selectedAlertRule?.metric ? ({ label: getAlertRuleMetricNameByValue(selectedAlertRule.metric), value: selectedAlertRule.metric } as AlertTypeOption) : null);
  const [threshold, setThreshold] = useState<number | null>(selectedAlertRule?.threshold ?? null);
  const [period, setPeriod] = useState<AlertRulePeriodOption>(selectedAlertRule?.period ? (getAlertPeriodOptions().find((o) => o.value === selectedAlertRule.period) ?? getAlertPeriodOptions()[0]) : getAlertPeriodOptions()[0]);
  const [emailList, setEmailList] = useState<string[]>(selectedAlertRule?.emails ?? []);
  const [errorThreshold, setErrorThreshold] = useState('');
  const [errorEmailList, setErrorEmailList] = useState<string | null>(null);

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
    setMetric(null);
    setThreshold(null);
    setPeriod(getAlertPeriodOptions()[0]);
    setEmailList([]);
    setErrorThreshold('');
    setErrorEmailList(null);
    setIsAlertRuleHalfConfigured(false);
  };

  const validate = (): AlertRule | null => {
    setErrorThreshold('');
    setErrorEmailList(null);
    let valid = true;
    if (emailList.length === 0) {
      setErrorEmailList(alertRuleConfigErrorMessages.required);
      valid = false;
    }
    if (!threshold || threshold < ALERT_RULE_THRESHOLD_MIN || threshold > ALERT_RULE_THRESHOLD_MAX) {
      setErrorThreshold(alertRuleConfigErrorMessages.threshold);
      valid = false;
    }
    if (!metric) valid = false;
    if (!valid) return null;
    Object.assign(alertRule, { metric: metric?.value, threshold, period: period.value, emails: emailList });
    return alertRule;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2, '& .MuiFormLabel-asterisk': { color: 'error.main' } }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Autocomplete
            options={resourceMetrics}
            getOptionLabel={(o) => o.label}
            value={metric}
            onChange={(_, v) => {
              setMetric(v);
              setIsAlertRuleHalfConfigured(true);
            }}
            renderInput={(params) => <TextField {...params} required label="Metric" placeholder="Select metric" size="small" />}
            isOptionEqualToValue={(o, v) => o.value === v.value}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField required label={`Threshold ${getResourceThresholdUnit(metric?.value)}`} placeholder="Enter threshold" size="small" fullWidth value={threshold ?? ''} onChange={handleThresholdChange} error={!!errorThreshold} helperText={errorThreshold} />
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
            error={!!errorEmailList}
            helperText={errorEmailList ?? undefined}
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
        {getAlertRuleExplanation(AlertTypes.RESOURCES, metric?.label, threshold, period.label as AlertRulePeriod)}
      </Alert>

      <AlertRuleFormActions
        isEditAlertRule={isEditAlertRule}
        isDisabled={!emailList.length || !threshold || !metric}
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
