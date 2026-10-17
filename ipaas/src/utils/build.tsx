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

/* eslint-disable react-refresh/only-export-components */
import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import { GitHub } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import AzureDevOpsIcon from '../assets/icons/AzureDevOpsIcon';
import GitLabIcon from '../assets/icons/GitLabIcon';
import BitbucketIcon from '../assets/icons/BitbucketIcon';
import GitLogoIcon from '../assets/icons/GitLogoIcon';
import type { BuildRunLogs } from '../types/build';
import type { Repository } from '../types/repository';
import {
  BAL_BUILD_ARG_FLAGS,
  BUILD_STAGES,
  MAX_BUILD_ENV_KEY_LENGTH,
  MAX_BUILD_ENV_VALUE_BYTES,
  RESERVED_BUILD_ENV_KEYS,
  RESERVED_BUILD_ENV_PREFIXES,
} from '../constants/build';

export function Row({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ textAlign: 'right' }}>{children}</Box>
    </Stack>
  );
}

export function safeAtob(encoded: string): string {
  try {
    return atob(encoded);
  } catch {
    return '';
  }
}

export function buildLogText(logs: BuildRunLogs | null | undefined): string | null {
  if (!logs) return '';

  const parts: string[] = [];
  let anyLogFieldPresent = false;

  for (const { key, label } of BUILD_STAGES) {
    const stage = logs[key];
    if (!stage) continue;
    if (stage.log !== null) anyLogFieldPresent = true;
    const decoded = stage.log ? safeAtob(stage.log).trim() : '';
    if (decoded && decoded !== 'No log data available') {
      parts.push(`\u25b6 ${label}\n${decoded}`);
    }
  }

  if (parts.length > 0) return parts.join('\n\n');

  if (anyLogFieldPresent) return null;

  const lines: string[] = [];
  for (const { key, label } of BUILD_STAGES) {
    const stage = logs[key];
    if (!stage || stage.steps.length === 0) continue;
    lines.push(`\u25b6 ${label}`);
    for (const step of stage.steps) {
      let icon = '○';
      if (step.conclusion === 'success') icon = '✓';
      else if (step.conclusion === 'failure' || step.conclusion === 'failed') icon = '✗';
      else if (step.conclusion === 'skipped') icon = '-';
      else if (step.status === 'in_progress') icon = '⟳';
      lines.push(`  ${icon} ${step.name}`);
    }
    lines.push('');
  }
  return lines.join('\n') || '';
}

export function getStepStatus(logs: BuildRunLogs | null, key: 'init' | 'build' | 'deploy'): 'success' | 'error' | 'warning' | 'active' | 'pending' {
  const stage = logs?.[key];
  if (!stage) return 'pending';
  if (stage.status === 'in_progress') return 'active';
  if (stage.status === 'completed') {
    const hasFailed = stage.steps.some((s) => {
      const c = s.conclusion?.toLowerCase();
      return c === 'failure' || c === 'failed';
    });
    if (hasFailed) return 'error';
    const hasWarning = stage.steps.some((s) => s.conclusion?.toLowerCase() === 'warning');
    if (hasWarning) return 'warning';
    return 'success';
  }
  return 'pending';
}

export function formatBuildDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function gitProviderLabel(provider: string): string {
  switch (provider?.toLowerCase()) {
    case 'github':
      return 'GitHub';
    case 'gitlab':
      return 'GitLab';
    case 'bitbucket':
      return 'Bitbucket';
    case 'bitbucket_server':
      return 'Bitbucket Server';
    default:
      return provider ?? '—';
  }
}

/** Map a git provider to its brand icon (generic Git logo for unknown/public providers). */
export function getGitProviderIcon(provider?: string): (props: { size?: number }) => ReactNode {
  switch (provider?.toLowerCase()) {
    case 'github':
      return GitHub;
    case 'gitlab':
    case 'gitlab_self_managed':
      return GitLabIcon;
    case 'bitbucket':
    case 'bitbucket_server':
      return BitbucketIcon;
    case 'azure_devops':
      return AzureDevOpsIcon;
    default:
      return GitLogoIcon;
  }
}

export function repoUrl(repository: Repository): string {
  const { gitProvider, serverUrl, bitbucketServerUrl, organizationApp, nameApp, projectApp } = repository;
  const base = serverUrl || bitbucketServerUrl;

  switch (gitProvider?.toLowerCase()) {
    case 'github':
      return `https://github.com/${organizationApp}/${nameApp}`;
    case 'gitlab':
      return base ? `${base}/${organizationApp}/${nameApp}` : `https://gitlab.com/${organizationApp}/${nameApp}`;
    case 'bitbucket':
      return `https://bitbucket.org/${organizationApp}/${nameApp}`;
    case 'bitbucket_server':
      return base ? `${base}/projects/${projectApp ?? organizationApp}/repos/${nameApp}` : `${organizationApp}/${nameApp}`;
    default:
      return '';
  }
}

// C0 control characters other than tab, and DEL.
const hasControlCharacter = (value: string) =>
  [...value].some((c) => {
    const code = c.charCodeAt(0);
    return (code < 0x20 && code !== 0x09) || code === 0x7f;
  });

export function validateBuildEnvVar(vars: Array<{ key: string; value: string }>, index: number, envKeyRegex: RegExp): string | null {
  const { key, value } = vars[index];
  if (!key.trim()) return 'Key is required';
  if (!envKeyRegex.test(key)) return 'Key must start with an uppercase letter or _ and contain only uppercase letters, digits, or _';
  if (key.length > MAX_BUILD_ENV_KEY_LENGTH) return `Key must be at most ${MAX_BUILD_ENV_KEY_LENGTH} characters`;
  if (RESERVED_BUILD_ENV_KEYS.includes(key) || RESERVED_BUILD_ENV_PREFIXES.some((p) => key.startsWith(p))) {
    return 'This name is reserved by the platform';
  }
  if (vars.some((v, i) => i !== index && v.key === key)) return 'Key already exists';
  if (!value.trim()) return 'Value is required';
  if (new TextEncoder().encode(value).length > MAX_BUILD_ENV_VALUE_BYTES) return `Value must be at most ${MAX_BUILD_ENV_VALUE_BYTES} bytes`;
  if (hasControlCharacter(value)) return 'Value must be a single line without control characters';
  if (key === 'OTHER_BAL_BUILD_ARGS' && value.split(' ').some((flag) => flag && !BAL_BUILD_ARG_FLAGS.includes(flag))) {
    return `Only these flags are allowed: ${BAL_BUILD_ARG_FLAGS.join(', ')}`;
  }
  return null;
}
