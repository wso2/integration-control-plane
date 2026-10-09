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

import { describe, expect, it } from 'vitest';
import {
  getAlertTypesTabItems,
  getAlertTypeOptions,
  getAlertMetricOptions,
  getAlertPeriodOptions,
  getAlertRuleExplanation,
  getAlertTypeOptionByValue,
  getAlertRuleMetricNameByValue,
  getAlertRulePeriodNameByValue,
  alertRuleConfigErrorMessages,
  getResourceThresholdUnit,
} from './alerts';
import { AlertTypeConstants, AlertTypes, AlertRulePeriodConstants } from '../../constants/alerts';

describe('getAlertTypesTabItems', () => {
  it('returns a tab item for every main alert type', () => {
    const items = getAlertTypesTabItems();
    expect(items).toEqual([
      { name: 'Latency', envId: 'latency' },
      { name: 'Traffic', envId: 'traffic' },
      { name: 'Status Code', envId: 'status_code' },
      { name: 'Resources', envId: 'resources' },
      { name: 'Logs', envId: 'logs' },
      { name: 'Build Failure', envId: 'build' },
    ]);
  });
});

describe('getAlertTypeOptions', () => {
  it('returns all main types by default', () => {
    expect(getAlertTypeOptions()).toEqual([
      { label: 'Latency', value: 'latency' },
      { label: 'Traffic', value: 'traffic' },
      { label: 'Status Code', value: 'status_code' },
      { label: 'Resources', value: 'resources' },
      { label: 'Logs', value: 'logs' },
      { label: 'Build Failure', value: 'build' },
    ]);
  });

  it('restricts to latency/traffic/status code for proxy components', () => {
    expect(getAlertTypeOptions(true)).toEqual([
      { label: 'Latency', value: 'latency' },
      { label: 'Traffic', value: 'traffic' },
      { label: 'Status Code', value: 'status_code' },
    ]);
  });
});

describe('getAlertMetricOptions', () => {
  it('returns latency percentile options for LATENCY', () => {
    expect(getAlertMetricOptions(AlertTypeConstants.LATENCY)).toEqual([
      { label: '99th Percentile', value: '99th_percentile' },
      { label: '95th Percentile', value: '95th_percentile' },
      { label: '90th Percentile', value: '90th_percentile' },
      { label: '50th Percentile', value: '50th_percentile' },
    ]);
  });

  it('returns status code options for STATUS_CODE', () => {
    const options = getAlertMetricOptions(AlertTypeConstants.STATUS_CODE);
    expect(options).toHaveLength(10);
    expect(options[0]).toEqual({ label: '400: Bad Request', value: '400_bad_request' });
    expect(options).toContainEqual({ label: 'Any: 5xx', value: 'any_5xx' });
  });

  it('returns cpu/memory options for RESOURCES', () => {
    expect(getAlertMetricOptions(AlertTypeConstants.RESOURCES)).toEqual([
      { label: 'CPU', value: 'cpu_usage' },
      { label: 'Memory', value: 'memory_usage' },
    ]);
  });

  it('returns an empty list for types without sub-metrics', () => {
    expect(getAlertMetricOptions(AlertTypeConstants.TRAFFIC)).toEqual([]);
    expect(getAlertMetricOptions(AlertTypeConstants.LOGS)).toEqual([]);
    expect(getAlertMetricOptions(AlertTypeConstants.BUILD)).toEqual([]);
  });
});

describe('getAlertPeriodOptions', () => {
  it('maps every alert rule period to a label/value pair', () => {
    expect(getAlertPeriodOptions()).toEqual([
      { label: '5 minutes', value: 5 },
      { label: '10 minutes', value: 10 },
      { label: '15 minutes', value: 15 },
      { label: '30 minutes', value: 30 },
      { label: '60 minutes', value: 60 },
    ]);
  });
});

describe('getAlertRuleExplanation', () => {
  it('explains LATENCY with a metric and threshold', () => {
    expect(getAlertRuleExplanation(AlertTypes.LATENCY, AlertTypes.LATENCY_99TH_PERCENTILE, 100, '5 minutes')).toBe('The email recipient(s) will receive an alert if the Latency 99th Percentile exceeds the threshold of 100 ms for a period of 5 minutes');
  });

  it('explains LATENCY without a metric or threshold', () => {
    expect(getAlertRuleExplanation(AlertTypes.LATENCY, undefined, undefined, '10 minutes')).toBe('The email recipient(s) will receive an alert if the Latency exceeds the threshold  for a period of 10 minutes');
  });

  it('explains TRAFFIC with a threshold', () => {
    expect(getAlertRuleExplanation(AlertTypes.TRAFFIC, undefined, 1000, '60 minutes')).toBe('The email recipient(s) will receive an alert if the traffic exceeds the threshold of 1000 requests per minute for a period of 60 minutes');
  });

  it('explains TRAFFIC without a threshold', () => {
    expect(getAlertRuleExplanation(AlertTypes.TRAFFIC, undefined, undefined, '5 minutes')).toBe('The email recipient(s) will receive an alert if the traffic exceeds the threshold  for a period of 5 minutes');
  });

  it('explains STATUS_CODE with a metric and threshold', () => {
    expect(getAlertRuleExplanation(AlertTypes.STATUS_CODE, AlertTypes.STATUS_CODE_404, 5, '5 minutes')).toBe('The email recipient(s) will receive an alert if the service responds with 404: Not Found status code for at least 5 times during 5 minutes');
  });

  it('explains STATUS_CODE without a metric or threshold', () => {
    expect(getAlertRuleExplanation(AlertTypes.STATUS_CODE, undefined, undefined, '15 minutes')).toBe('The email recipient(s) will receive an alert if the service responds with selected status code for at least given count during 15 minutes');
  });

  it('explains RESOURCES cpu usage in mCPU', () => {
    expect(getAlertRuleExplanation(AlertTypes.RESOURCES, AlertTypes.RESOURCES_CPU, 500, '15 minutes')).toBe('The email recipient(s) will receive an alert if the CPU  usage exceeds the threshold of 500 mCPU for a period of 15 minutes');
  });

  it('explains RESOURCES memory usage in MiB', () => {
    expect(getAlertRuleExplanation(AlertTypes.RESOURCES, AlertTypes.RESOURCES_MEMORY, 200, '30 minutes')).toBe('The email recipient(s) will receive an alert if the Memory  usage exceeds the threshold of 200 MiB for a period of 30 minutes');
  });

  it('explains RESOURCES without a metric or threshold', () => {
    expect(getAlertRuleExplanation(AlertTypes.RESOURCES, undefined, undefined, '5 minutes')).toBe('The email recipient(s) will receive an alert if the resource usage exceeds the threshold  for a period of 5 minutes');
  });

  it('explains LOGS with a null search phrase', () => {
    expect(getAlertRuleExplanation(AlertTypes.LOGS, undefined, undefined, '5 minutes', null)).toBe('The email recipient(s) will receive an alert if the given logs search phrase is found in the application logs for at least given count during 5 minutes');
  });

  it('explains LOGS with a search phrase and threshold', () => {
    expect(getAlertRuleExplanation(AlertTypes.LOGS, undefined, 3, '10 minutes', 'error')).toBe('The email recipient(s) will receive an alert if the phrase "error" is found in the application logs for at least 3 times during 10 minutes');
  });

  it('explains BUILD with a fixed message regardless of other args', () => {
    expect(getAlertRuleExplanation(AlertTypes.BUILD)).toBe('The email recipient(s) will receive an alert if a build failure occurs for the component in the selected deployment track.');
  });

  it('returns an empty string for an unrecognized alert type', () => {
    expect(getAlertRuleExplanation('unknown' as AlertTypes)).toBe('');
  });
});

describe('getAlertTypeOptionByValue', () => {
  it('finds the option matching a known constant', () => {
    expect(getAlertTypeOptionByValue(AlertTypeConstants.STATUS_CODE_404)).toEqual({ label: '404: Not Found', value: '404_not_found' });
  });

  it('returns an empty string for an unknown value', () => {
    expect(getAlertTypeOptionByValue('not-a-real-value' as AlertTypeConstants)).toBe('');
  });
});

describe('getAlertRuleMetricNameByValue', () => {
  it('finds the label matching a known constant', () => {
    expect(getAlertRuleMetricNameByValue(AlertTypeConstants.RESOURCES_CPU)).toBe('CPU');
  });

  it('returns an empty string for an unknown value', () => {
    expect(getAlertRuleMetricNameByValue('not-a-real-value' as AlertTypeConstants)).toBe('');
  });
});

describe('getAlertRulePeriodNameByValue', () => {
  it('finds the label matching a known constant', () => {
    expect(getAlertRulePeriodNameByValue(AlertRulePeriodConstants.THIRTY_MINUTES)).toBe('30 minutes');
  });

  it('returns an empty string for an unknown value', () => {
    expect(getAlertRulePeriodNameByValue(999 as AlertRulePeriodConstants)).toBe('');
  });
});

describe('alertRuleConfigErrorMessages', () => {
  it('exposes a message for each validation case', () => {
    expect(alertRuleConfigErrorMessages).toEqual({
      required: 'Please add at least one email address',
      threshold: 'Please enter a valid threshold',
      searchPhrase: 'Please enter a valid search phrase',
      searchPhraseTooLong: 'Search phrase cannot be longer than 200 characters',
      count: 'Please enter a valid count',
    });
  });
});

describe('getResourceThresholdUnit', () => {
  it('returns mCPU for cpu usage', () => {
    expect(getResourceThresholdUnit(AlertTypeConstants.RESOURCES_CPU)).toBe('(mCPU)');
  });

  it('returns MiB for memory usage', () => {
    expect(getResourceThresholdUnit(AlertTypeConstants.RESOURCES_MEMORY)).toBe('(MiB)');
  });

  it('returns an empty string for other values', () => {
    expect(getResourceThresholdUnit('other')).toBe('');
  });

  it('returns an empty string for null or undefined', () => {
    expect(getResourceThresholdUnit(null)).toBe('');
    expect(getResourceThresholdUnit(undefined)).toBe('');
  });
});
