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

import { Alert, Box, Grid } from '@wso2/oxygen-ui';
import { type JSX, useEffect, useState } from 'react';
import { NOTIFICATION_BUILD_ALERT_EXIST, NOTIFICATION_BUILD_ALERT_EXIST_TITLE, AlertComponentType, AlertTypeConstants, AlertTypes } from '../../../../constants/alerts';
import { alertRuleConfigErrorMessages, getAlertRuleExplanation } from '../../../utils/alerts';
import type { AlertRule, AlertRuleFormProps } from '../../../../types/alerts';
import AlertRuleFormActions from './AlertRuleFormActions';
import EmailTagInput from '../../EmailTagInput';

export default function BuildAlertRuleForm(props: AlertRuleFormProps): JSX.Element {
  const {
    environment,
    componentId,
    projectId,
    versionId,
    versionName,
    projectName,
    environmentName,
    selectedAlertRule,
    isEditAlertRule,
    goBackToAlertRules,
    setSelectedAlertTypeEnvVersion,
    setIsAlertRuleHalfConfigured,
    buildAlertRules = [],
    alertingBaseUrl,
    onNotify,
  } = props;

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
        type: AlertTypeConstants.BUILD,
        emails: [],
        enabled: true,
      } as AlertRule);

  const [buildAlertRulesForVersion, setBuildAlertRulesForVersion] = useState<AlertRule[]>(buildAlertRules.filter((r) => r.versionId === versionId));
  useEffect(() => {
    setBuildAlertRulesForVersion(buildAlertRules.filter((r) => r.versionId === versionId));
  }, [versionId, buildAlertRules]);

  useEffect(() => {
    setIsAlertRuleHalfConfigured(false);
  }, [setIsAlertRuleHalfConfigured]);

  const [emailList, setEmailList] = useState<string[]>(selectedAlertRule?.emails ?? []);
  const [errorEmailList, setErrorEmailList] = useState<string | null>(null);

  const cleanup = () => {
    setEmailList([]);
    setErrorEmailList('');
    setIsAlertRuleHalfConfigured(false);
  };

  const validate = (): AlertRule | null => {
    setErrorEmailList('');
    if (emailList.length === 0) {
      setErrorEmailList(alertRuleConfigErrorMessages.required);
      return null;
    }
    Object.assign(alertRule, { emails: emailList });
    return alertRule;
  };

  const buildAlertExists = buildAlertRulesForVersion.length > 0 && !isEditAlertRule;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
      {!buildAlertExists && (
        <Grid container spacing={3}>
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
      )}

      {buildAlertExists ? (
        <Alert severity="warning" variant="outlined">
          <strong>{NOTIFICATION_BUILD_ALERT_EXIST_TITLE}</strong>
          <br />
          {NOTIFICATION_BUILD_ALERT_EXIST}
        </Alert>
      ) : (
        <Alert severity="info" variant="outlined">
          {getAlertRuleExplanation(AlertTypes.BUILD)}
        </Alert>
      )}

      <AlertRuleFormActions
        isEditAlertRule={isEditAlertRule}
        isDisabled={!emailList.length || buildAlertExists}
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
