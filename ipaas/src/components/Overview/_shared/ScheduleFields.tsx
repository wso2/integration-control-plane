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

import { Alert, Autocomplete, Box, Button, Checkbox, Collapse, FormControlLabel, MenuItem, Select, Stack, Tab, Tabs, Typography, TextField } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { INTERVAL_UNITS, TIMEZONE_OPTIONS, CRON_FIELD_LABELS, type IntervalUnit, type CronField, getTimezoneLabel } from '../../../utils/cronUtils';
import { describeMinutes, describeSeconds } from '../../../utils/scheduleValidation';
import type { ScheduleLimits } from '../../../types/schedule';
import type { ScheduleFormApi } from './useScheduleForm';

/** What the free plan holds back, for the notice: "Schedules that run more often than …, … can only be configured on a paid plan." */
function freePlanNotice(free: ScheduleLimits, paid: ScheduleLimits, executionSettings: boolean): string | null {
  const held: string[] = [];
  if (free.minRunIntervalMinutes > Math.max(paid.minRunIntervalMinutes, 1)) held.push(`schedules that run more often than every ${describeMinutes(free.minRunIntervalMinutes)}`);
  if (executionSettings && free.maxTimeoutSeconds > 0) held.push(`job timeouts over ${describeSeconds(free.maxTimeoutSeconds)}`);
  if (executionSettings && !free.allowOverlap && paid.allowOverlap) held.push('overlapping executions');
  if (held.length === 0) return null;
  const list = held.length === 1 ? held[0] : `${held.slice(0, -1).join(', ')}, and ${held[held.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} can only be configured on a paid plan.`;
}

/**
 * Presentational cron editor bound to a {@link useScheduleForm} instance.
 * `executionSettings={false}` leaves out the job timeout and overlap settings,
 * for jobs whose execution behaviour is fixed by the platform.
 */
export default function ScheduleFields({ form, executionSettings = true }: { form: ScheduleFormApi; executionSettings?: boolean }): JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { tab, setTab, intervalCount, setIntervalCount, intervalUnit, setIntervalUnit, cronFields, setCronFields, cron, description, errors, plan, policy } = form;
  const notice = policy.policy ? freePlanNotice(policy.policy.free, policy.policy.paid, executionSettings) : null;
  const frequencyError = errors.frequency && (
    <Typography variant="body2" color="error">
      {errors.frequency}
    </Typography>
  );

  return (
    <Stack gap={2}>
      {policy.isError && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={policy.retry}>
              Retry
            </Button>
          }>
          Couldn&apos;t load the schedule limits. The schedule can be saved once they load.
        </Alert>
      )}
      {plan?.state === 'free' && notice && <Alert severity="info">{notice}</Alert>}
      {plan?.state === 'unavailable' && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={plan.retry}>
              Retry
            </Button>
          }>
          Couldn&apos;t check your plan. Schedules beyond the free plan&apos;s limits are unavailable until it loads.
        </Alert>
      )}
      <Tabs value={tab} onChange={(_e, v: number) => setTab(v)}>
        <Tab label="BY INTERVAL" />
        <Tab label="BY CRON" />
      </Tabs>

      {tab === 0 ? (
        <Stack gap={1.5}>
          <Typography variant="body2" color="text.secondary">
            Repeat beginning of every
          </Typography>
          {/* Top-aligned: the count's reserved helper line would otherwise stretch the unit select. */}
          <Stack direction="row" gap={2} alignItems="flex-start">
            <TextField
              inputMode="numeric"
              value={intervalCount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setIntervalCount(raw === '' ? '' : parseInt(raw, 10));
              }}
              onBlur={() => {
                if (typeof intervalCount !== 'number' || intervalCount < 1) setIntervalCount(1);
              }}
              error={!!errors.intervalCount}
              helperText={errors.intervalCount || ' '}
              sx={{ width: 120 }}
            />
            <Select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)} sx={{ flex: 1 }}>
              {INTERVAL_UNITS.map((u) => (
                <MenuItem key={u} value={u}>
                  {u}
                </MenuItem>
              ))}
            </Select>
          </Stack>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
          {frequencyError}
        </Stack>
      ) : (
        <Stack gap={1.5}>
          <Typography variant="body1" sx={{ fontFamily: 'monospace', textAlign: 'center', py: 0.5 }}>
            {cron}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              {description}
            </Typography>
          )}
          {frequencyError}
          {CRON_FIELD_LABELS.map(({ key, label, placeholder }) => (
            <Box key={key}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder={placeholder}
                value={cronFields[key as CronField]}
                onChange={(e) => setCronFields((prev) => ({ ...prev, [key]: e.target.value }))}
                error={!!errors.cron[key as CronField]}
                helperText={errors.cron[key as CronField] || ' '}
              />
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">
            * any value &nbsp; , multiple values &nbsp; - range &nbsp; / step
          </Typography>
        </Stack>
      )}

      <Box>
        <Button variant="text" size="small" endIcon={advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} onClick={() => setAdvancedOpen((v) => !v)} sx={{ px: 0 }}>
          Advanced settings
        </Button>
        <Collapse in={advancedOpen || !!errors.timeout || !!errors.overlap}>
          <Stack gap={2} sx={{ mt: 1.5 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                In time zone
              </Typography>
              <Autocomplete
                options={TIMEZONE_OPTIONS}
                value={TIMEZONE_OPTIONS.find((o) => o.value === form.timezone) ?? { label: getTimezoneLabel(form.timezone), value: form.timezone }}
                onChange={(_e, v) => form.setTimezone(v?.value ?? 'UTC')}
                getOptionLabel={(o) => o.label}
                isOptionEqualToValue={(o, v) => o.value === v.value}
                renderInput={(params) => <TextField {...params} size="small" />}
              />
            </Box>
            {executionSettings && (
              <>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Job Timeout (in seconds) (Optional)
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    value={form.timeoutSeconds}
                    onChange={(e) => form.setTimeoutSeconds(e.target.value)}
                    placeholder={policy.policy ? `Default: ${policy.policy.defaultTimeoutSeconds}` : undefined}
                    error={!!errors.timeout}
                    helperText={errors.timeout || ' '}
                  />
                </Box>
                <Box>
                  <FormControlLabel control={<Checkbox checked={form.allowConcurrency} onChange={(e) => form.setAllowConcurrency(e.target.checked)} size="small" />} label="Allow overlapping executions" />
                  {errors.overlap && (
                    <Typography variant="body2" color="error">
                      {errors.overlap}
                    </Typography>
                  )}
                </Box>
              </>
            )}
          </Stack>
        </Collapse>
      </Box>
    </Stack>
  );
}
