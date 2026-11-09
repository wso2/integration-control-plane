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
import { type PlanScheduleErrors, validateCronFields, validatePlanSchedule, validateIntervalCount, validateTimeout } from '../../../utils/scheduleValidation';
import type { SchedulePolicy } from '../../../types/schedule';
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
  /** Set when the timeout is over the org's plan's limit. */
  timeoutLimit?: string;
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
  /** The limits and defaults of this kind of schedule. */
  policy: SchedulePolicy;
}

const NO_PLAN_ERRORS: PlanScheduleErrors = {};

/**
 * Owns the schedule form state (interval/cron, timezone, execution behaviour),
 * seeded from an existing schedule. Shared by the standalone Schedule drawer and
 * the RAG ingestion Configure drawer's Schedule step — the single source of the
 * cron editing logic. Pair with the `ScheduleFields` presentational component.
 */
export function useScheduleForm(existingConfigs: ExecutionConfigs | null | undefined, plan: PlanAccess | null, policy: SchedulePolicy): ScheduleFormApi {
  const defaultInterval = cronToInterval(policy.defaultCron);
  const [tab, setTab] = useState(defaultInterval ? 0 : 1);
  const [intervalCount, setIntervalCount] = useState<number | ''>(defaultInterval?.count ?? 1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(defaultInterval?.unit ?? 'Minute');
  const [cronFields, setCronFields] = useState<Record<CronField, string>>(() => parseCronParts(policy.defaultCron));
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

  const cron = tab === 0 ? intervalToCron(intervalCount || 1, intervalUnit) : buildCronFromParts(cronFields);
  const free = plan?.state !== 'paid';
  const limits = free ? policy.free : policy.paid;
  const savedCron = existingConfigs?.cronjobFrequency ?? '';
  const savedTimeout = existingConfigs?.timeoutSeconds ?? null;
  const savedConcurrency = existingConfigs?.cronjobAllowConcurrency ?? null;

  const planErrors = useMemo(
    () => validatePlanSchedule(cron, timeoutSeconds, allowConcurrency, { cron: savedCron, timeoutSeconds: savedTimeout, allowConcurrency: savedConcurrency }, limits, free),
    [cron, timeoutSeconds, allowConcurrency, savedCron, savedTimeout, savedConcurrency, limits, free],
  );
  // While the plan loads, a paid user would see free-plan errors, so none are shown; a schedule beyond
  // the free limits still can't be saved until the plan says whether it is allowed.
  const planLoading = plan === null;
  const shownPlanErrors = planLoading ? NO_PLAN_ERRORS : planErrors;

  // Only the active tab's fields are validated: the other tab's state is not written.
  const errors = useMemo<ScheduleFormErrors>(
    () => ({
      timeout: validateTimeout(timeoutSeconds),
      timeoutLimit: shownPlanErrors.timeout,
      intervalCount: tab === 0 ? validateIntervalCount(intervalCount) : undefined,
      cron: tab === 1 ? validateCronFields(cronFields) : {},
      frequency: shownPlanErrors.frequency,
      overlap: shownPlanErrors.overlap,
    }),
    [timeoutSeconds, tab, intervalCount, cronFields, shownPlanErrors],
  );
  const waitingForPlan = planLoading && Object.values(planErrors).some(Boolean);
  const isValid = !waitingForPlan && !errors.timeout && !errors.timeoutLimit && !errors.intervalCount && !errors.frequency && !errors.overlap && Object.keys(errors.cron).length === 0;

  return {
    tab,
    setTab,
    intervalCount,
    setIntervalCount,
    intervalUnit,
    setIntervalUnit,
    cronFields,
    setCronFields,
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
