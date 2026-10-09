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

import type { AlertTypeOption } from '../../types/alerts';
import { AlertRulePeriod, AlertRulePeriodConstants, AlertMainTypes, AlertTypes, AlertTypeConstants } from '../../constants/alerts';

export const getAlertTypesTabItems = () =>
  [AlertMainTypes.LATENCY, AlertMainTypes.TRAFFIC, AlertMainTypes.STATUS_CODE, AlertMainTypes.RESOURCES, AlertMainTypes.LOGS, AlertMainTypes.BUILD].map((type) => ({
    name: AlertTypes[type],
    envId: AlertTypeConstants[type],
  }));

export const getAlertTypeOptions = (isProxy = false): AlertTypeOption[] => {
  // Proxy components only support LATENCY, TRAFFIC, STATUS_CODE.
  const types = isProxy ? [AlertMainTypes.LATENCY, AlertMainTypes.TRAFFIC, AlertMainTypes.STATUS_CODE] : [AlertMainTypes.LATENCY, AlertMainTypes.TRAFFIC, AlertMainTypes.STATUS_CODE, AlertMainTypes.RESOURCES, AlertMainTypes.LOGS, AlertMainTypes.BUILD];
  return types.map((type) => ({
    label: AlertTypes[type],
    value: AlertTypeConstants[type],
  }));
};

export const getAlertMetricOptions = (alertType: AlertTypeConstants): AlertTypeOption[] => {
  switch (alertType) {
    case AlertTypeConstants.LATENCY:
      return Object.keys(AlertTypeConstants)
        .filter((key) => key.startsWith('LATENCY_'))
        .map((key) => ({
          label: AlertTypes[key as keyof typeof AlertTypes],
          value: AlertTypeConstants[key as keyof typeof AlertTypeConstants],
        }));
    case AlertTypeConstants.STATUS_CODE:
      return Object.keys(AlertTypeConstants)
        .filter((key) => key.startsWith('STATUS_CODE_'))
        .map((key) => ({
          label: AlertTypes[key as keyof typeof AlertTypes],
          value: AlertTypeConstants[key as keyof typeof AlertTypeConstants],
        }));
    case AlertTypeConstants.RESOURCES:
      return Object.keys(AlertTypeConstants)
        .filter((key) => key.startsWith('RESOURCES_'))
        .map((key) => ({
          label: AlertTypes[key as keyof typeof AlertTypes],
          value: AlertTypeConstants[key as keyof typeof AlertTypeConstants],
        }));
    default:
      return [];
  }
};

export const getAlertPeriodOptions = () =>
  Object.keys(AlertRulePeriod).map((key) => ({
    label: AlertRulePeriod[key as keyof typeof AlertRulePeriod],
    value: AlertRulePeriodConstants[key as keyof typeof AlertRulePeriodConstants],
  }));

export const getAlertRuleExplanation = (alertType: AlertTypes, metric?: AlertTypes | string, threshold?: number | null, period?: AlertRulePeriod | string, searchPhrase?: string | null) => {
  const metricUnit = metric === AlertTypes.RESOURCES_CPU ? 'mCPU' : 'MiB';
  switch (alertType) {
    case AlertTypes.LATENCY:
      return `The email recipient(s) will receive an alert if the Latency ${metric ? `${metric} ` : ''}exceeds the threshold ${threshold ? `of ${threshold} ms` : ''} for a period of ${period}`;
    case AlertTypes.TRAFFIC:
      return `The email recipient(s) will receive an alert if the traffic exceeds the threshold ${threshold ? `of ${threshold} requests per minute` : ''} for a period of ${period}`;
    case AlertTypes.STATUS_CODE:
      return `The email recipient(s) will receive an alert if the service responds with ${metric ? `${metric} ` : 'selected '}status code for at least ${threshold ? `${threshold} times` : 'given count'} during ${period}`;
    case AlertTypes.RESOURCES:
      return `The email recipient(s) will receive an alert if the ${metric ? `${metric} ` : 'resource'} usage exceeds the threshold ${threshold ? `of ${threshold} ${metricUnit}` : ''} for a period of ${period}`;
    case AlertTypes.LOGS:
      return `The email recipient(s) will receive an alert if the ${searchPhrase === null ? 'given logs search phrase' : `phrase "${searchPhrase}"`} is found in the application logs for at least ${threshold ? `${threshold} times` : 'given count'} during ${period}`;
    case AlertTypes.BUILD:
      return 'The email recipient(s) will receive an alert if a build failure occurs for the component in the selected deployment track.';
    default:
      return '';
  }
};

export const getAlertTypeOptionByValue = (alertTypeConstant: AlertTypeConstants): AlertTypeOption | '' => {
  const matchingEntry = Object.entries(AlertTypeConstants).find(([, value]) => value === alertTypeConstant);
  if (!matchingEntry) return '';
  const [key] = matchingEntry;
  return {
    label: AlertTypes[key as keyof typeof AlertTypes],
    value: AlertTypeConstants[key as keyof typeof AlertTypeConstants],
  };
};

export const getAlertRuleMetricNameByValue = (metric: AlertTypeConstants): AlertTypes | '' => {
  const matchingEntry = Object.entries(AlertTypeConstants).find(([, value]) => value === metric);
  if (!matchingEntry) return '';
  const [key] = matchingEntry;
  return AlertTypes[key as keyof typeof AlertTypes];
};

export const getAlertRulePeriodNameByValue = (period: AlertRulePeriodConstants): string => {
  const matchingEntry = Object.entries(AlertRulePeriodConstants).find(([, value]) => value === period);
  if (!matchingEntry) return '';
  const [key] = matchingEntry;
  return AlertRulePeriod[key as keyof typeof AlertRulePeriod];
};

export const alertRuleConfigErrorMessages = {
  required: 'Please add at least one email address',
  threshold: 'Please enter a valid threshold',
  searchPhrase: 'Please enter a valid search phrase',
  searchPhraseTooLong: 'Search phrase cannot be longer than 200 characters',
  count: 'Please enter a valid count',
};

export const getResourceThresholdUnit = (metricValue: string | null | undefined): string => {
  if (metricValue === AlertTypeConstants.RESOURCES_CPU) return '(mCPU)';
  if (metricValue === AlertTypeConstants.RESOURCES_MEMORY) return '(MiB)';
  return '';
};
