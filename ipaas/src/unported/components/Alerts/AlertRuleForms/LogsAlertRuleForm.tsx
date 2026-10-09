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
  ALERT_RULE_LOG_SEARCH_PHRASE_MAX_LENGTH,
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

export default function LogsAlertRuleForm(props: AlertRuleFormProps): JSX.Element {
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
        type: AlertTypeConstants.LOGS,
        searchPhrase: '',
        count: 1,
        interval: AlertRulePeriodConstants.FIVE_MINUTES,
        logType: 'Application',
        emails: [],
        enabled: true,
      } as AlertRule);

  const [searchPhrase, setSearchPhrase] = useState<string | null>(selectedAlertRule?.searchPhrase ?? null);
  const [count, setCount] = useState<number | null>(selectedAlertRule?.count ?? ALERT_RULE_THRESHOLD_MIN);
  const [interval, setIntervalState] = useState<AlertRulePeriodOption>(selectedAlertRule?.interval ? (getAlertPeriodOptions().find((o) => o.value === selectedAlertRule.interval) ?? getAlertPeriodOptions()[0]) : getAlertPeriodOptions()[0]);
  const [emailList, setEmailList] = useState<string[]>(selectedAlertRule?.emails ?? []);
  const [errorSearchPhrase, setErrorSearchPhrase] = useState<string | null>(null);
  const [errorCount, setErrorCount] = useState<string | null>(null);
  const [errorEmailList, setErrorEmailList] = useState<string | null>(null);

  useEffect(() => {
    setIsAlertRuleHalfConfigured(false);
    const searchParams = new URLSearchParams(window.location.search);
    const querySearchPhrase = searchParams.get('searchPhrase');
    if (querySearchPhrase) {
      setSearchPhrase(querySearchPhrase);
      searchParams.delete('searchPhrase');
      const qs = searchParams.toString();
      const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
    }
  }, [setIsAlertRuleHalfConfigured]);

  const handleSearchPhraseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    if (!value) {
      setErrorSearchPhrase(alertRuleConfigErrorMessages.searchPhrase);
      setSearchPhrase(null);
      return;
    }
    if (value.length > ALERT_RULE_LOG_SEARCH_PHRASE_MAX_LENGTH) {
      setErrorSearchPhrase(alertRuleConfigErrorMessages.searchPhraseTooLong);
      return;
    }
    setErrorSearchPhrase('');
    setSearchPhrase(value);
    setIsAlertRuleHalfConfigured(true);
  };

  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    if (Number.isNaN(Number(value)) || Number(value) < ALERT_RULE_THRESHOLD_MIN || Number(value) > ALERT_RULE_THRESHOLD_MAX) {
      setErrorCount(alertRuleConfigErrorMessages.count);
      setCount(null);
      return;
    }
    setErrorCount('');
    setCount(Number(value));
    setIsAlertRuleHalfConfigured(true);
  };

  const cleanup = () => {
    setSearchPhrase(null);
    setCount(null);
    setIntervalState(getAlertPeriodOptions()[0]);
    setEmailList([]);
    setErrorSearchPhrase('');
    setErrorCount('');
    setErrorEmailList(null);
    setIsAlertRuleHalfConfigured(false);
  };

  const validate = (): AlertRule | null => {
    setErrorSearchPhrase('');
    setErrorCount('');
    setErrorEmailList(null);
    let valid = true;
    if (emailList.length === 0) {
      setErrorEmailList(alertRuleConfigErrorMessages.required);
      valid = false;
    }
    if (!searchPhrase) {
      setErrorSearchPhrase(alertRuleConfigErrorMessages.searchPhrase);
      valid = false;
    }
    if (!count || count < ALERT_RULE_THRESHOLD_MIN || count > ALERT_RULE_THRESHOLD_MAX) {
      setErrorCount(alertRuleConfigErrorMessages.count);
      valid = false;
    }
    if (!valid) return null;
    Object.assign(alertRule, { searchPhrase, count, interval: interval.value, emails: emailList });
    return alertRule;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2, '& .MuiFormLabel-asterisk': { color: 'error.main' } }}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField required label="Logs search phrase" placeholder="Enter search phrase" size="small" fullWidth value={searchPhrase ?? ''} onChange={handleSearchPhraseChange} error={!!errorSearchPhrase} helperText={errorSearchPhrase ?? undefined} />
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
                value={interval}
                onChange={(_, v) => {
                  if (v) {
                    setIntervalState(v);
                    setIsAlertRuleHalfConfigured(true);
                  }
                }}
                renderInput={(params) => <TextField {...params} label="Interval" placeholder="Select interval" size="small" />}
                isOptionEqualToValue={(o, v) => o.value === v.value}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Count" placeholder="Enter count" size="small" fullWidth value={count ?? ''} onChange={handleCountChange} error={!!errorCount} helperText={errorCount ?? undefined} />
            </Grid>
          </Grid>
        </Collapse>
      </Box>

      <Alert severity="info" variant="outlined">
        {getAlertRuleExplanation(AlertTypes.LOGS, undefined, count, interval.label as AlertRulePeriod, searchPhrase)}
      </Alert>

      <AlertRuleFormActions
        isEditAlertRule={isEditAlertRule}
        isDisabled={!emailList.length || !searchPhrase || !count || !interval}
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
