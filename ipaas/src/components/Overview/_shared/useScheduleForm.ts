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
import { FREE_PLAN_SCHEDULE_LIMITS, validateCronFields, validateFreePlanSchedule, validateIntervalCount, validateTimeout } from '../../../utils/scheduleValidation';
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
}

/** Minutes between runs of a new schedule: the most frequent its plan allows. */
function defaultMinutes(plan: PlanAccess | null): number {
  return plan?.state === 'paid' ? 1 : FREE_PLAN_SCHEDULE_LIMITS.minIntervalMinutes;
}

/**
 * Owns the schedule form state (interval/cron, timezone, execution behaviour),
 * seeded from an existing schedule. Shared by the standalone Schedule drawer and
 * the RAG ingestion Configure drawer's Schedule step — the single source of the
 * cron editing logic. Pair with the `ScheduleFields` presentational component.
 */
export function useScheduleForm(existingConfigs: ExecutionConfigs | null | undefined, plan: PlanAccess | null): ScheduleFormApi {
  const [tab, setTab] = useState(0);
  const [intervalCount, setIntervalCount] = useState<number | ''>(defaultMinutes(plan));
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('Minute');
  const [cronFields, setCronFields] = useState<Record<CronField, string>>({ minute: `*/${defaultMinutes(plan)}`, hour: '*', dom: '*', month: '*', dow: '*' });
  // Until the user edits it, a new schedule follows its default, which changes when the plan loads.
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

  const hasSchedule = !!existingConfigs?.cronjobFrequency || scheduleEdited;
  const newScheduleMinutes = hasSchedule ? null : defaultMinutes(plan);
  useEffect(() => {
    if (newScheduleMinutes === null) return;
    setTab(0);
    setIntervalCount(newScheduleMinutes);
    setIntervalUnit('Minute');
    setCronFields((prev) => ({ ...prev, minute: `*/${newScheduleMinutes}` }));
  }, [newScheduleMinutes]);
  const edit =
    <T>(set: (v: T) => void) =>
    (v: T) => {
      setScheduleEdited(true);
      set(v);
    };

  const cron = tab === 0 ? intervalToCron(intervalCount || 1, intervalUnit) : buildCronFromParts(cronFields);
  const limited = plan?.state !== 'paid';
  const savedCron = existingConfigs?.cronjobFrequency ?? '';
  const savedTimeout = existingConfigs?.timeoutSeconds ?? null;

  // Only the active tab's fields are validated: the other tab's state is not written.
  const errors = useMemo<ScheduleFormErrors>(() => {
    const planErrors = limited ? validateFreePlanSchedule(cron, timeoutSeconds, { cron: savedCron, timeoutSeconds: savedTimeout }) : {};
    return {
      timeout: validateTimeout(timeoutSeconds) ?? planErrors.timeout,
      intervalCount: tab === 0 ? validateIntervalCount(intervalCount) : undefined,
      cron: tab === 1 ? validateCronFields(cronFields) : {},
      frequency: planErrors.frequency,
    };
  }, [timeoutSeconds, tab, intervalCount, cronFields, cron, limited, savedCron, savedTimeout]);
  const isValid = !errors.timeout && !errors.intervalCount && !errors.frequency && Object.keys(errors.cron).length === 0;

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
