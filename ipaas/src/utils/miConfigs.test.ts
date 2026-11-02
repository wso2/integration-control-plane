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
import type { EnvGroup, MiConfig } from '../types/envGroups';
import { applyMiConfigSavePlan, type EnvGroupWriter, isEmptyMiConfigSavePlan, MI_ENV_VARS_GROUP, miConfigCount, MiPromoteConfigError, miSecretGroup, planMiConfigSave, promoteWithMiConfig, toMiConfig, toMiConfigDraft, validateMiConfigDraft } from './miConfigs';

const group = (name: string, sensitive: boolean, keys: string[]): EnvGroup => ({ name, sensitive, keys, data: {} });

describe('toMiConfig', () => {
  it('reads env vars from the MI group and secrets from the per-secret groups', () => {
    const groups = [group(MI_ENV_VARS_GROUP, false, ['HOST', 'PORT']), group(miSecretGroup('TOKEN'), true, ['TOKEN']), group(miSecretGroup('API_KEY'), true, ['API_KEY'])];
    expect(toMiConfig(groups, { HOST: 'example.com', PORT: '8290' })).toEqual({
      envVars: [
        { key: 'HOST', value: 'example.com' },
        { key: 'PORT', value: '8290' },
      ],
      secrets: ['API_KEY', 'TOKEN'],
    });
  });

  it('ignores groups made on the Configs & Secrets page', () => {
    const groups = [group('db-settings', false, ['DB_URL']), group('db-creds', true, ['DB_PASSWORD'])];
    expect(toMiConfig(groups, {})).toEqual({ envVars: [], secrets: [] });
  });

  it('ignores secret groups that only look like MI ones', () => {
    // Prefix matches but the name is not miSecretGroup(key): multiple keys, or a key that differs.
    const groups = [group('mi-secret-db', true, ['DB_USER', 'DB_PASS']), group('mi-secret-OTHER', true, ['TOKEN']), group(miSecretGroup('API_KEY'), true, ['API_KEY'])];
    expect(toMiConfig(groups, {}).secrets).toEqual(['API_KEY']);
  });
});

describe('toMiConfigDraft', () => {
  it('trims keys and keeps values as typed', () => {
    expect(toMiConfigDraft([{ key: ' HOST ', value: ' a ' }], [{ key: 'TOKEN ', value: 's' }])).toEqual({ envVars: [{ key: 'HOST', value: ' a ' }], secrets: [{ key: 'TOKEN', value: 's' }] });
  });
});

describe('miConfigCount', () => {
  it('counts env vars and secrets', () => {
    expect(miConfigCount({ envVars: [{ key: 'A', value: '1' }], secrets: ['B', 'C'] })).toBe(3);
  });
});

describe('validateMiConfigDraft', () => {
  it('accepts valid keys and a blank value for a stored secret', () => {
    const draft = { envVars: [{ key: 'HOST', value: '' }], secrets: [{ key: 'TOKEN', value: '' }] };
    expect(validateMiConfigDraft(draft, ['TOKEN']).size).toBe(0);
  });

  it('rejects invalid keys', () => {
    const errors = validateMiConfigDraft({ envVars: [{ key: '1BAD', value: 'x' }], secrets: [] }, []);
    expect(errors.has('env:0')).toBe(true);
  });

  it('flags every row of a key used twice, even across env vars and secrets', () => {
    // The env var is the row being typed; the clashing secret is already stored.
    const errors = validateMiConfigDraft({ envVars: [{ key: 'KEY', value: 'x' }], secrets: [{ key: 'KEY', value: '' }] }, ['KEY']);
    expect(errors.get('env:0')).toMatch(/more than once/);
    expect(errors.get('secret:0')).toMatch(/more than once/);
  });

  it('requires a value for a new secret', () => {
    const errors = validateMiConfigDraft({ envVars: [], secrets: [{ key: 'TOKEN', value: '' }] }, []);
    expect(errors.get('secret:0')).toMatch(/Enter a value/);
  });
});

describe('planMiConfigSave', () => {
  const stored: MiConfig = { envVars: [{ key: 'HOST', value: 'a' }], secrets: ['TOKEN'] };

  it('plans nothing when the draft matches what is stored', () => {
    const plan = planMiConfigSave(stored, { envVars: [{ key: 'HOST', value: 'a' }], secrets: [{ key: 'TOKEN', value: '' }] });
    expect(isEmptyMiConfigSavePlan(plan)).toBe(true);
  });

  it('rewrites the env-var group when a value changes', () => {
    const plan = planMiConfigSave(stored, { envVars: [{ key: 'HOST', value: 'b' }], secrets: [{ key: 'TOKEN', value: '' }] });
    expect(plan.envVars).toEqual({ HOST: 'b' });
    expect(plan.secretsToPut).toEqual([]);
  });

  it('rewrites the env-var group when a duplicated draft key hides a removed one', () => {
    const plan = planMiConfigSave(
      { envVars: [{ key: 'HOST', value: 'a' }, { key: 'PORT', value: '80' }], secrets: [] },
      { envVars: [{ key: 'HOST', value: 'a' }, { key: 'HOST', value: 'a' }], secrets: [] },
    );
    expect(plan.envVars).toEqual({ HOST: 'a' });
  });

  it('deletes the env-var group when every variable is removed', () => {
    const plan = planMiConfigSave(stored, { envVars: [], secrets: [{ key: 'TOKEN', value: '' }] });
    expect(plan.envVars).toBeNull();
  });

  it('writes only secrets with a value and deletes removed ones', () => {
    const plan = planMiConfigSave(
      { envVars: [], secrets: ['TOKEN', 'OLD'] },
      {
        envVars: [],
        secrets: [
          { key: 'TOKEN', value: '' },
          { key: 'NEW', value: 's3cret' },
        ],
      },
    );
    expect(plan.envVars).toBeUndefined();
    expect(plan.secretsToPut).toEqual([{ key: 'NEW', value: 's3cret' }]);
    expect(plan.secretsToDelete).toEqual(['OLD']);
  });

  it('replaces a stored secret given a new value', () => {
    const plan = planMiConfigSave(stored, { envVars: [{ key: 'HOST', value: 'a' }], secrets: [{ key: 'TOKEN', value: 'rotated' }] });
    expect(plan.secretsToPut).toEqual([{ key: 'TOKEN', value: 'rotated' }]);
    expect(plan.secretsToDelete).toEqual([]);
  });
});

describe('applyMiConfigSavePlan', () => {
  // Records each write in order; `failOn` makes the write to that group throw.
  const recorder = (failOn?: string) => {
    const calls: string[] = [];
    const writer: EnvGroupWriter = {
      put: async (name, sensitive, data) => {
        if (name === failOn) throw new Error(`Cannot write ${name}.`);
        calls.push(`put ${name} ${sensitive ? 'secret' : 'plain'} ${JSON.stringify(data)}`);
      },
      remove: async (name) => {
        if (name === failOn) throw new Error(`Cannot delete ${name}.`);
        calls.push(`delete ${name}`);
      },
    };
    return { calls, writer };
  };

  it('removes secrets before writing env vars, then writes secrets', async () => {
    // TOKEN moves from a secret to an env var: its secret group must go before the env-var group sets it.
    const { calls, writer } = recorder();
    await applyMiConfigSavePlan({ envVars: { TOKEN: 'plain' }, secretsToPut: [{ key: 'NEW', value: 's' }], secretsToDelete: ['TOKEN'] }, writer);
    expect(calls).toEqual([`delete ${miSecretGroup('TOKEN')}`, `put ${MI_ENV_VARS_GROUP} plain {"TOKEN":"plain"}`, `put ${miSecretGroup('NEW')} secret {"NEW":"s"}`]);
  });

  it('deletes the env-var group for a null plan and leaves it alone for undefined', async () => {
    const removed = recorder();
    await applyMiConfigSavePlan({ envVars: null, secretsToPut: [], secretsToDelete: [] }, removed.writer);
    expect(removed.calls).toEqual([`delete ${MI_ENV_VARS_GROUP}`]);

    const untouched = recorder();
    await applyMiConfigSavePlan({ envVars: undefined, secretsToPut: [], secretsToDelete: [] }, untouched.writer);
    expect(untouched.calls).toEqual([]);
  });

  it('passes the error through unchanged when the first write fails', async () => {
    const { calls, writer } = recorder(miSecretGroup('OLD'));
    await expect(applyMiConfigSavePlan({ envVars: { A: '1' }, secretsToPut: [], secretsToDelete: ['OLD'] }, writer)).rejects.toThrow(/^Cannot delete mi-secret-OLD\.$/);
    expect(calls).toEqual([]);
  });

  it('says some changes were saved when a later write fails, and stops there', async () => {
    const { calls, writer } = recorder(MI_ENV_VARS_GROUP);
    await expect(applyMiConfigSavePlan({ envVars: { A: '1' }, secretsToPut: [{ key: 'S', value: 'v' }], secretsToDelete: ['OLD'] }, writer)).rejects.toThrow('Cannot write mi-env-vars. Some changes were saved before this failed. Save again to apply the rest.');
    expect(calls).toEqual([`delete ${miSecretGroup('OLD')}`]);
  });
});

describe('promoteWithMiConfig', () => {
  const empty: MiConfig = { envVars: [], secrets: [] };
  const draft = { envVars: [{ key: 'HOST', value: 'prod.example.com' }], secrets: [{ key: 'TOKEN', value: 'prod-token' }] };

  // Records the promotion and each write in order; `failOn` makes the write to that group throw.
  const steps = (target: MiConfig, failOn?: string) => {
    const calls: string[] = [];
    return {
      calls,
      steps: {
        promote: async () => {
          calls.push('promote');
        },
        readTarget: async () => {
          calls.push('read target');
          return target;
        },
        writer: {
          put: async (name: string, _sensitive: boolean, data: Record<string, string>) => {
            if (name === failOn) throw new Error(`Cannot write ${name}.`);
            calls.push(`put ${name} ${JSON.stringify(data)}`);
          },
          remove: async (name: string) => {
            calls.push(`delete ${name}`);
          },
        },
      },
    };
  };

  it('promotes, then writes the draft to the target', async () => {
    const run = steps(empty);
    await promoteWithMiConfig(draft, run.steps);
    expect(run.calls).toEqual(['promote', 'read target', `put ${MI_ENV_VARS_GROUP} {"HOST":"prod.example.com"}`, `put ${miSecretGroup('TOKEN')} {"TOKEN":"prod-token"}`]);
  });

  it('only promotes when there is nothing to write', async () => {
    const run = steps(empty);
    await promoteWithMiConfig({ envVars: [], secrets: [] }, run.steps);
    expect(run.calls).toEqual(['promote', 'read target']);
  });

  it('replaces what an earlier deployment left in the target', async () => {
    const run = steps({ envVars: [{ key: 'OLD', value: 'x' }], secrets: ['STALE'] });
    await promoteWithMiConfig(draft, run.steps);
    expect(run.calls).toEqual(['promote', 'read target', `delete ${miSecretGroup('STALE')}`, `put ${MI_ENV_VARS_GROUP} {"HOST":"prod.example.com"}`, `put ${miSecretGroup('TOKEN')} {"TOKEN":"prod-token"}`]);
  });

  it('writes nothing when the promotion fails', async () => {
    const run = steps(empty);
    run.steps.promote = async () => {
      throw new Error('Promotion not allowed.');
    };
    await expect(promoteWithMiConfig(draft, run.steps)).rejects.toThrow(/^Promotion not allowed\.$/);
    expect(run.calls).toEqual([]);
  });

  it('says the integration was promoted when a write fails', async () => {
    const run = steps(empty, miSecretGroup('TOKEN'));
    const result = promoteWithMiConfig(draft, run.steps);
    await expect(result).rejects.toBeInstanceOf(MiPromoteConfigError);
    await expect(result).rejects.toThrow('The integration was promoted, but its configurations were not all saved: Cannot write mi-secret-TOKEN. Some changes were saved before this failed. Save again to apply the rest.');
  });

  it('skips the promotion on a retry', async () => {
    const run = steps({ envVars: [{ key: 'HOST', value: 'prod.example.com' }], secrets: [] });
    await promoteWithMiConfig(draft, run.steps, true);
    expect(run.calls).toEqual(['read target', `put ${miSecretGroup('TOKEN')} {"TOKEN":"prod-token"}`]);
  });
});
