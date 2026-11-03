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

import { Box, Collapse, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import type { ReactNode } from 'react';
import { TIME_UNITS } from '../../constants/policy';
import type { RateLimitConfig, RateLimitLevel, RateLimitOperation, RateLimitRule, TimeUnit } from '../../types/policy';
import { isRateLimitValid, isRuleValid } from '../../utils/policy';

interface RateLimitingSectionProps {
  value: RateLimitConfig;
  onChange: (value: RateLimitConfig) => void;
  disabled?: boolean;
  /** Explains what the limit applies to; each surface names its own subject. */
  description: ReactNode;
  /** Operations a per-operation limit can attach to. Empty hides the resource-level choice. */
  operations?: RateLimitOperation[];
  /** Label for the API-wide choice. Defaults to "Limited" for a surface with only one level. */
  apiLevelLabel?: string;
}

const DEFAULT_RULE: RateLimitRule = { requestCount: '', timeUnit: 'MINUTE' };

/**
 * Editor for an API's request rate limit: unlimited, one allowance for the whole API, or one per
 * operation. Controlled by the parent so it can track dirty state and save in one request.
 */
export default function RateLimitingSection({ value, onChange, disabled, description, operations, apiLevelLabel }: RateLimitingSectionProps): ReactNode {
  const limited = value.level === 'API_LEVEL';
  const perOperation = value.level === 'RESOURCE_LEVEL';
  const countError = limited && value.requestCount !== '' && !isRateLimitValid(value);
  const rules = value.operations ?? {};
  const canSelectResource = !!operations && operations.length > 0;

  const setRule = (key: string, rule: RateLimitRule) => onChange({ ...value, operations: { ...rules, [key]: rule } });

  return (
    <Stack gap={1.5}>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>

      <RadioGroup row value={value.level} onChange={(e) => onChange({ ...value, level: e.target.value as RateLimitLevel })}>
        <FormControlLabel value="UNLIMITED" disabled={disabled} control={<Radio size="small" />} label={<Typography variant="body2">Unlimited</Typography>} />
        <FormControlLabel value="API_LEVEL" disabled={disabled} control={<Radio size="small" />} label={<Typography variant="body2">{apiLevelLabel ?? 'Limited'}</Typography>} />
        {canSelectResource && <FormControlLabel value="RESOURCE_LEVEL" disabled={disabled} control={<Radio size="small" />} label={<Typography variant="body2">Per operation</Typography>} />}
      </RadioGroup>

      <Collapse in={limited} unmountOnExit>
        <Stack direction="row" alignItems="flex-start" gap={2}>
          <TextField
            labelPlacement="top"
            size="small"
            type="number"
            label="Max requests"
            required
            value={value.requestCount}
            onChange={(e) => onChange({ ...value, requestCount: e.target.value })}
            disabled={disabled}
            error={countError}
            helperText={countError ? 'Enter a positive whole number.' : ' '}
            sx={{ width: 160 }}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
          />
          <TextField labelPlacement="top" select size="small" label="Per" value={value.timeUnit} onChange={(e) => onChange({ ...value, timeUnit: e.target.value as TimeUnit })} disabled={disabled} sx={{ width: 140 }} helperText=" ">
            {TIME_UNITS.map((u) => (
              <MenuItem key={u.value} value={u.value}>
                {u.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Collapse>

      <Collapse in={perOperation} unmountOnExit>
        <Stack gap={1.5}>
          {(operations ?? []).map((op) => {
            const rule = rules[op.key] ?? DEFAULT_RULE;
            const ruleError = rule.requestCount !== '' && !isRuleValid(rule);
            return (
              <Stack key={op.key} direction="row" alignItems="flex-start" gap={2}>
                <Box sx={{ minWidth: 200, pt: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, mr: 0.75 }}>
                    {op.verb.toUpperCase()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {op.target}
                  </Typography>
                </Box>
                <TextField
                  labelPlacement="top"
                  size="small"
                  type="number"
                  label="Max requests"
                  optional
                  value={rule.requestCount}
                  onChange={(e) => setRule(op.key, { ...rule, requestCount: e.target.value })}
                  disabled={disabled}
                  error={ruleError}
                  helperText={ruleError ? 'Enter a positive whole number.' : ' '}
                  sx={{ width: 160 }}
                  slotProps={{ htmlInput: { min: 1, step: 1 } }}
                />
                <TextField labelPlacement="top" select size="small" label="Per" value={rule.timeUnit} onChange={(e) => setRule(op.key, { ...rule, timeUnit: e.target.value as TimeUnit })} disabled={disabled} sx={{ width: 140 }} helperText=" ">
                  {TIME_UNITS.map((u) => (
                    <MenuItem key={u.value} value={u.value}>
                      {u.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            );
          })}
          <Typography variant="caption" color="text.secondary">
            Operations left blank stay unlimited.
          </Typography>
        </Stack>
      </Collapse>
    </Stack>
  );
}
