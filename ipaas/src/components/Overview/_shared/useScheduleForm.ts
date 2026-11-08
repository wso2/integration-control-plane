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

import { useEffect, useMemo, useState } from 'react';
import { type IntervalUnit, type CronField, intervalToCron, cronToInterval, parseCronParts, buildCronFromParts, describeCron } from '../../../utils/cronUtils';
import { validateCronFields, validatePlanSchedule, validateIntervalCount, validateTimeout } from '../../../utils/scheduleValidation';
import type { SchedulePolicyRead } from '../../../hooks/useScheduleLimits';
import type { ExecutionConfigs } from '../../../types/executions';
import type { PlanAccess } from '../../../utils/billing';
import type { DeployDeploymentTrackInput } from '../../../types/deployment';

/** The assembled schedule values a caller submits (to `useDeployDeploymentTrack`). */
export interface ScheduleValues {
  cron: string;
  timezone: string;
  /** Empty string when unset. */
  timeoutSeconds: string;
  allowConcurrency: boolean;
}

export interface ScheduleFormErrors {
  timeout?: string;
  intervalCount?: string;
  /** Set when the schedule runs more often than the org's plan allows. */
  frequency?: string;
  /** Set when overlapping runs are chosen and the org's plan does not allow them. */
  overlap?: string;
  cron: Partial<Record<CronField, string>>;
}

export interface ScheduleFormApi extends ScheduleValues {
  errors: ScheduleFormErrors;
  /** False while any visible field is invalid, so callers can block the write. */
  isValid: boolean;
  tab: number;
  setTab: (v: number) => void;
  /** Empty string while the field is being cleared/edited; coerced to a valid count for the cron. */
  intervalCount: number | '';
  setIntervalCount: (v: number | '') => void;
  intervalUnit: IntervalUnit;
  setIntervalUnit: (v: IntervalUnit) => void;
  cronFields: Record<CronField, string>;
  setCronFields: (fn: (prev: Record<CronField, string>) => Record<CronField, string>) => void;
  setTimezone: (v: string) => void;
  setTimeoutSeconds: (v: string) => void;
  setAllowConcurrency: (v: boolean) => void;
  description: string;
  /** The org's plan, null while it loads. Anything but a paid plan gets the free plan's limits. */
  plan: PlanAccess | null;
  /** The limits and defaults ipaas-service applies to this kind of schedule. Save is blocked until they load. */
  policy: SchedulePolicyRead;
}

/**
 * Owns the schedule form state (interval/cron, timezone, execution behaviour),
 * seeded from an existing schedule. Shared by the standalone Schedule drawer and
 * the RAG ingestion Configure drawer's Schedule step — the single source of the
 * cron editing logic. Pair with the `ScheduleFields` presentational component.
 */
export function useScheduleForm(existingConfigs: ExecutionConfigs | null | undefined, plan: PlanAccess | null, policy: SchedulePolicyRead): ScheduleFormApi {
  const [tab, setTab] = useState(0);
  const [intervalCount, setIntervalCount] = useState<number | ''>(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('Day');
  const [cronFields, setCronFields] = useState<Record<CronField, string>>(() => parseCronParts('0 0 */1 * *'));
  // A new schedule takes the policy's default once it loads, unless the user has edited it already.
  const [scheduleEdited, setScheduleEdited] = useState(false);
  const [timezone, setTimezone] = useState('UTC');
  const [timeoutSeconds, setTimeoutSeconds] = useState('');
  const [allowConcurrency, setAllowConcurrency] = useState(false);

  useEffect(() => {
    if (!existingConfigs) return;
    const freq = existingConfigs.cronjobFrequency;
    setTimezone(existingConfigs.cronjobTimezone || 'UTC');
    if (existingConfigs.timeoutSeconds != null) setTimeoutSeconds(String(existingConfigs.timeoutSeconds));
    if (existingConfigs.cronjobAllowConcurrency != null) setAllowConcurrency(existingConfigs.cronjobAllowConcurrency);
    if (!freq) return;
    const parsed = cronToInterval(freq);
    if (parsed) {
      setTab(0);
      setIntervalCount(parsed.count);
      setIntervalUnit(parsed.unit);
    } else {
      setTab(1);
      setCronFields(parseCronParts(freq));
    }
  }, [existingConfigs]);

  const keepsItsSchedule = !!existingConfigs?.cronjobFrequency || scheduleEdited;
  const defaultCron = keepsItsSchedule ? null : (policy.policy?.defaultCron ?? null);
  useEffect(() => {
    if (!defaultCron) return;
    const parsed = cronToInterval(defaultCron);
    if (parsed) {
      setTab(0);
      setIntervalCount(parsed.count);
      setIntervalUnit(parsed.unit);
    } else {
      setTab(1);
    }
    setCronFields(parseCronParts(defaultCron));
  }, [defaultCron]);
  const edit =
    <T>(set: (v: T) => void) =>
    (v: T) => {
      setScheduleEdited(true);
      set(v);
    };

  const cron = tab === 0 ? intervalToCron(intervalCount || 1, intervalUnit) : buildCronFromParts(cronFields);
  const free = plan?.state !== 'paid';
  const limits = policy.policy ? (free ? policy.policy.free : policy.policy.paid) : null;
  const savedCron = existingConfigs?.cronjobFrequency ?? '';
  const savedTimeout = existingConfigs?.timeoutSeconds ?? null;
  const savedConcurrency = existingConfigs?.cronjobAllowConcurrency ?? null;

  // Only the active tab's fields are validated: the other tab's state is not written.
  const errors = useMemo<ScheduleFormErrors>(() => {
    const planErrors = limits ? validatePlanSchedule(cron, timeoutSeconds, allowConcurrency, { cron: savedCron, timeoutSeconds: savedTimeout, allowConcurrency: savedConcurrency }, limits, free) : {};
    return {
      timeout: validateTimeout(timeoutSeconds) ?? planErrors.timeout,
      intervalCount: tab === 0 ? validateIntervalCount(intervalCount) : undefined,
      cron: tab === 1 ? validateCronFields(cronFields) : {},
      frequency: planErrors.frequency,
      overlap: planErrors.overlap,
    };
  }, [timeoutSeconds, tab, intervalCount, cronFields, cron, allowConcurrency, limits, free, savedCron, savedTimeout, savedConcurrency]);
  const isValid = !!limits && !errors.timeout && !errors.intervalCount && !errors.frequency && !errors.overlap && Object.keys(errors.cron).length === 0;

  return {
    tab,
    setTab: edit(setTab),
    intervalCount,
    setIntervalCount: edit(setIntervalCount),
    intervalUnit,
    setIntervalUnit: edit(setIntervalUnit),
    cronFields,
    setCronFields: edit(setCronFields),
    timezone,
    setTimezone,
    timeoutSeconds,
    setTimeoutSeconds,
    allowConcurrency,
    setAllowConcurrency,
    cron,
    description: describeCron(cron),
    errors,
    isValid,
    plan,
    policy,
  };
}

/** Identifiers a schedule redeploy needs, alongside the {@link useScheduleForm} values. */
export interface ScheduleDeployIds {
  componentId: string;
  versionId: string;
  /** Build/image id to redeploy with. */
  imageId: string;
  envId: string;
  deploymentPipelineId: string;
}

/**
 * Assemble the `useDeployDeploymentTrack` payload from the schedule form values.
 * Shared by the standalone Schedule drawer and the RAG ingestion Configure
 * drawer's Schedule step so the deploy schema stays in sync across both.
 */
export function buildScheduleDeployInput(form: ScheduleValues, ids: ScheduleDeployIds): DeployDeploymentTrackInput {
  const timeoutSeconds = parseInt(form.timeoutSeconds, 10);
  return {
    componentId: ids.componentId,
    id: ids.versionId,
    imageId: ids.imageId,
    environmentId: ids.envId,
    deploymentPipelineId: ids.deploymentPipelineId,
    cron: form.cron,
    cronTimezone: form.timezone,
    ...(Number.isFinite(timeoutSeconds) ? { jobTimeoutSeconds: timeoutSeconds } : {}),
    cronJobAllowConcurrency: form.allowConcurrency,
  };
}
