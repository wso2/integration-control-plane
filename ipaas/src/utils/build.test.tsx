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

import { describe, expect, it, vi } from 'vitest';

vi.mock('@wso2/oxygen-ui-icons-react', () => ({
  GitHub: () => null,
}));

vi.mock('@wso2/oxygen-ui', () => ({
  Box: () => null,
  Stack: () => null,
  Typography: () => null,
}));

vi.mock('../assets/icons/AzureDevOpsIcon', () => ({ default: () => null }));
vi.mock('../assets/icons/GitLabIcon', () => ({ default: () => null }));
vi.mock('../assets/icons/BitbucketIcon', () => ({ default: () => null }));
vi.mock('../assets/icons/GitLogoIcon', () => ({ default: () => null }));

import { GitHub } from '@wso2/oxygen-ui-icons-react';
import AzureDevOpsIcon from '../assets/icons/AzureDevOpsIcon';
import GitLabIcon from '../assets/icons/GitLabIcon';
import BitbucketIcon from '../assets/icons/BitbucketIcon';
import GitLogoIcon from '../assets/icons/GitLogoIcon';
import { safeAtob, buildLogText, getStepStatus, formatBuildDate, gitProviderLabel, getGitProviderIcon, repoUrl, validateBuildEnvVar } from './build';
import { ENV_KEY_RE } from '../constants/build';
import type { BuildRunLogs, BuildStage } from '../types/build';
import type { Repository } from '../types/repository';

function makeStage(overrides: Partial<BuildStage> = {}): BuildStage {
  return { log: null, status: null, steps: [], ...overrides };
}

function makeLogs(overrides: Partial<BuildRunLogs> = {}): BuildRunLogs {
  return {
    init: makeStage(),
    build: makeStage(),
    deploy: makeStage(),
    ...overrides,
  };
}

describe('safeAtob', () => {
  it('decodes valid base64', () => {
    expect(safeAtob('aGVsbG8=')).toBe('hello');
  });

  it('returns an empty string for malformed input', () => {
    expect(safeAtob('!!!not-base64!!!')).toBe('');
  });
});

describe('buildLogText', () => {
  it('returns an empty string for null logs', () => {
    expect(buildLogText(null)).toBe('');
  });

  it('returns an empty string for logs that have not loaded yet', () => {
    expect(buildLogText(undefined)).toBe('');
  });

  it('joins decoded stage logs with the stage label', () => {
    const logs = makeLogs({ init: makeStage({ log: btoa('starting up'), status: 'completed' }) });
    expect(buildLogText(logs)).toBe('▶ Initialization\nstarting up');
  });

  it('joins multiple stage logs with a blank line between them', () => {
    const logs = makeLogs({
      init: makeStage({ log: btoa('init log'), status: 'completed' }),
      build: makeStage({ log: btoa('build log'), status: 'completed' }),
    });
    expect(buildLogText(logs)).toBe('▶ Initialization\ninit log\n\n▶ Build Source & Test\nbuild log');
  });

  it('ignores stages whose decoded log is the placeholder text', () => {
    const logs = makeLogs({ init: makeStage({ log: btoa('No log data available'), status: 'completed' }) });
    expect(buildLogText(logs)).toBe(null);
  });

  it('returns null when a log field is present but decodes to nothing usable', () => {
    const logs = makeLogs({ init: makeStage({ log: btoa('   '), status: 'completed' }) });
    expect(buildLogText(logs)).toBe(null);
  });

  it('falls back to a step-based summary when no log field is present anywhere', () => {
    const logs = makeLogs({
      init: makeStage({
        steps: [
          { number: 1, name: 'Checkout', status: 'completed', conclusion: 'success' },
          { number: 2, name: 'Compile', status: 'completed', conclusion: 'failure' },
          { number: 3, name: 'Test', status: 'completed', conclusion: 'failed' },
          { number: 4, name: 'Skip me', status: 'completed', conclusion: 'skipped' },
          { number: 5, name: 'Running', status: 'in_progress', conclusion: null },
          { number: 6, name: 'Unknown', status: 'queued', conclusion: null },
        ],
      }),
    });
    expect(buildLogText(logs)).toBe(['▶ Initialization', '  ✓ Checkout', '  ✗ Compile', '  ✗ Test', '  - Skip me', '  ⟳ Running', '  ○ Unknown', ''].join('\n'));
  });

  it('returns an empty string when there are no logs and no steps at all', () => {
    expect(buildLogText(makeLogs())).toBe('');
  });

  it('skips stages with no steps in the fallback summary', () => {
    const logs = makeLogs({
      init: makeStage({ steps: [] }),
      build: makeStage({ steps: [{ number: 1, name: 'Compile', status: 'completed', conclusion: 'success' }] }),
    });
    expect(buildLogText(logs)).toBe(['▶ Build Source & Test', '  ✓ Compile', ''].join('\n'));
  });
});

describe('getStepStatus', () => {
  it('returns pending when the stage is missing', () => {
    expect(getStepStatus(null, 'init')).toBe('pending');
    expect(getStepStatus(makeLogs({ init: undefined as unknown as BuildStage }), 'init')).toBe('pending');
  });

  it('returns active when the stage is in progress', () => {
    const logs = makeLogs({ init: makeStage({ status: 'in_progress' }) });
    expect(getStepStatus(logs, 'init')).toBe('active');
  });

  it('returns error when a completed stage has a failed step', () => {
    const logs = makeLogs({
      init: makeStage({ status: 'completed', steps: [{ number: 1, name: 'a', status: 'completed', conclusion: 'FAILURE' }] }),
    });
    expect(getStepStatus(logs, 'init')).toBe('error');
  });

  it('treats a "failed" conclusion the same as "failure"', () => {
    const logs = makeLogs({
      init: makeStage({ status: 'completed', steps: [{ number: 1, name: 'a', status: 'completed', conclusion: 'failed' }] }),
    });
    expect(getStepStatus(logs, 'init')).toBe('error');
  });

  it('returns warning when a completed stage has a warning step and no failures', () => {
    const logs = makeLogs({
      init: makeStage({ status: 'completed', steps: [{ number: 1, name: 'a', status: 'completed', conclusion: 'WARNING' }] }),
    });
    expect(getStepStatus(logs, 'init')).toBe('warning');
  });

  it('returns success when a completed stage has no failed or warning steps', () => {
    const logs = makeLogs({
      init: makeStage({ status: 'completed', steps: [{ number: 1, name: 'a', status: 'completed', conclusion: 'success' }] }),
    });
    expect(getStepStatus(logs, 'init')).toBe('success');
  });

  it('returns success when a completed stage has no steps', () => {
    const logs = makeLogs({ init: makeStage({ status: 'completed', steps: [] }) });
    expect(getStepStatus(logs, 'init')).toBe('success');
  });

  it('returns pending for any other stage status', () => {
    const logs = makeLogs({ init: makeStage({ status: 'queued' }) });
    expect(getStepStatus(logs, 'init')).toBe('pending');
  });
});

describe('formatBuildDate', () => {
  it('returns an em dash for an empty string', () => {
    expect(formatBuildDate('')).toBe('—');
  });

  it('formats a valid ISO date', () => {
    const iso = '2026-01-15T10:30:00.000Z';
    expect(formatBuildDate(iso)).toBe(new Date(iso).toLocaleString());
  });

  it('returns the original string for an invalid but truthy date', () => {
    expect(formatBuildDate('not-a-date')).toBe(new Date('not-a-date').toLocaleString());
  });
});

describe('gitProviderLabel', () => {
  it('labels github', () => {
    expect(gitProviderLabel('github')).toBe('GitHub');
  });

  it('labels gitlab', () => {
    expect(gitProviderLabel('gitlab')).toBe('GitLab');
  });

  it('labels bitbucket', () => {
    expect(gitProviderLabel('bitbucket')).toBe('Bitbucket');
  });

  it('labels bitbucket_server', () => {
    expect(gitProviderLabel('bitbucket_server')).toBe('Bitbucket Server');
  });

  it('is case-insensitive', () => {
    expect(gitProviderLabel('GitHub')).toBe('GitHub');
  });

  it('falls back to the raw provider for unknown values', () => {
    expect(gitProviderLabel('azure_devops')).toBe('azure_devops');
  });

  it('returns an empty string for an empty provider', () => {
    expect(gitProviderLabel('')).toBe('');
  });

  it('falls back to an em dash when the provider is undefined', () => {
    expect(gitProviderLabel(undefined as unknown as string)).toBe('—');
  });
});

describe('getGitProviderIcon', () => {
  it('maps github', () => {
    expect(getGitProviderIcon('github')).toBe(GitHub);
  });

  it('maps gitlab', () => {
    expect(getGitProviderIcon('gitlab')).toBe(GitLabIcon);
  });

  it('maps gitlab_self_managed to the same icon as gitlab', () => {
    expect(getGitProviderIcon('gitlab_self_managed')).toBe(GitLabIcon);
  });

  it('maps bitbucket', () => {
    expect(getGitProviderIcon('bitbucket')).toBe(BitbucketIcon);
  });

  it('maps bitbucket_server to the same icon as bitbucket', () => {
    expect(getGitProviderIcon('bitbucket_server')).toBe(BitbucketIcon);
  });

  it('maps azure_devops', () => {
    expect(getGitProviderIcon('azure_devops')).toBe(AzureDevOpsIcon);
  });

  it('is case-insensitive', () => {
    expect(getGitProviderIcon('GitHub')).toBe(GitHub);
  });

  it('falls back to the generic git logo for unknown providers', () => {
    expect(getGitProviderIcon('unknown')).toBe(GitLogoIcon);
  });

  it('falls back to the generic git logo when no provider is given', () => {
    expect(getGitProviderIcon(undefined)).toBe(GitLogoIcon);
  });
});

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    gitProvider: 'github',
    organizationApp: 'my-org',
    nameApp: 'my-repo',
    branch: 'main',
    appSubPath: '/',
    ...overrides,
  };
}

describe('repoUrl', () => {
  it('builds a github url', () => {
    expect(repoUrl(makeRepo({ gitProvider: 'github' }))).toBe('https://github.com/my-org/my-repo');
  });

  it('builds a gitlab.com url when there is no server url', () => {
    expect(repoUrl(makeRepo({ gitProvider: 'gitlab' }))).toBe('https://gitlab.com/my-org/my-repo');
  });

  it('builds a self-hosted gitlab url when a server url is present', () => {
    expect(repoUrl(makeRepo({ gitProvider: 'gitlab', serverUrl: 'https://gitlab.internal' }))).toBe('https://gitlab.internal/my-org/my-repo');
  });

  it('builds a bitbucket.org url', () => {
    expect(repoUrl(makeRepo({ gitProvider: 'bitbucket' }))).toBe('https://bitbucket.org/my-org/my-repo');
  });

  it('builds a bitbucket server url using the project app when present', () => {
    expect(repoUrl(makeRepo({ gitProvider: 'bitbucket_server', bitbucketServerUrl: 'https://bb.internal', projectApp: 'PROJ' }))).toBe('https://bb.internal/projects/PROJ/repos/my-repo');
  });

  it('falls back to the organization app as the bitbucket server project when projectApp is absent', () => {
    expect(repoUrl(makeRepo({ gitProvider: 'bitbucket_server', bitbucketServerUrl: 'https://bb.internal' }))).toBe('https://bb.internal/projects/my-org/repos/my-repo');
  });

  it('falls back to a bare org/name when bitbucket server has no server url', () => {
    expect(repoUrl(makeRepo({ gitProvider: 'bitbucket_server' }))).toBe('my-org/my-repo');
  });

  it('returns an empty string for an unknown provider', () => {
    expect(repoUrl(makeRepo({ gitProvider: 'azure_devops' }))).toBe('');
  });
});

describe('validateBuildEnvVar', () => {
  const keyRegex = ENV_KEY_RE;
  const one = (key: string, value: string) => validateBuildEnvVar([{ key, value }], 0, keyRegex);

  it('requires a non-empty key', () => {
    expect(validateBuildEnvVar([{ key: '  ', value: 'v' }], 0, keyRegex)).toBe('Key is required');
  });

  it.each(['1abc', 'foo', 'Foo', 'layers_dir', 'A-B', 'PATH\n'])('rejects the key %j', (key) => {
    expect(one(key, 'v')).toBe('Key must start with an uppercase letter or _ and contain only uppercase letters, digits, or _');
  });

  it('caps the key length', () => {
    expect(one('K'.repeat(256), 'v')).toBe(null);
    expect(one('K'.repeat(257), 'v')).toBe('Key must be at most 256 characters');
  });

  it.each(['PATH', 'PRIVATE_APP_TOKEN', 'BALLERINA_DISTRIBUTION_HOST', 'IFS', 'CNB_PLATFORM_API'])('rejects the reserved key %s', (key) => {
    expect(one(key, 'v')).toBe('This name is reserved by the platform');
  });

  it('caps the value at 4096 bytes', () => {
    expect(one('FOO', 'v'.repeat(4096))).toBe(null);
    expect(one('FOO', 'λ'.repeat(2049))).toBe('Value must be at most 4096 bytes');
  });

  it.each(['a\nb', 'a\rb', 'a\u0000b', '\u001b[2J'])('rejects the control characters in %j', (value) => {
    expect(one('FOO', value)).toBe('Value must be a single line without control characters');
  });

  it('allows a tab in a value', () => {
    expect(one('FOO', 'a\tb')).toBe(null);
  });

  it('accepts only the allowed bal build flags in OTHER_BAL_BUILD_ARGS', () => {
    expect(one('OTHER_BAL_BUILD_ARGS', '--offline  --show-dependency-diagnostics')).toBe(null);
    for (const value of ['--cloud=docker', '--offline; id', '--graalvm', '$(id)']) {
      expect(one('OTHER_BAL_BUILD_ARGS', value)).toMatch(/^Only these flags are allowed: --offline/);
    }
  });

  it('rejects a duplicate key', () => {
    const vars = [
      { key: 'FOO', value: 'a' },
      { key: 'FOO', value: 'b' },
    ];
    expect(validateBuildEnvVar(vars, 1, keyRegex)).toBe('Key already exists');
  });

  it('requires a non-empty value', () => {
    expect(validateBuildEnvVar([{ key: 'FOO', value: '  ' }], 0, keyRegex)).toBe('Value is required');
  });

  it('returns null when the entry is valid', () => {
    const vars = [
      { key: 'FOO', value: 'bar' },
      { key: 'BAZ', value: 'qux' },
    ];
    expect(validateBuildEnvVar(vars, 0, keyRegex)).toBe(null);
  });
});
